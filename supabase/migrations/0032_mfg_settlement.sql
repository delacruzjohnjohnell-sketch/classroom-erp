-- ============================================================
-- Classroom ERP — migration 0032 (Manufacturing ERP, Phase 4b: settlement, reversals, co-/by-products, delivery)
--
-- Needs 0023–0031. ADDITIVE ONLY: new tables and functions, and new columns on Manufacturing tables. No Standard table,
-- function, policy or trigger is changed. Three Phase 4a functions are redefined with the same signature
-- (mfg_create_order, mfg_post_confirmation, mfg_post_fg_receipt) — they are Manufacturing's own.
--
--   settlement        mfg_settle_order sweeps what is left in work in process after the finished goods came out into the
--                     variance accounts (standard costing: material usage, labor efficiency, machine/variable overhead,
--                     fixed overhead; actual costing: whatever was not carried into stock goes to Scrap & Rework Loss)
--                     and makes the order technically complete; mfg_close_order closes it (needs zero work in process);
--                     mfg_reverse_settlement undoes a settlement that was not yet closed
--   reversals         a posted stock document or confirmation is never edited: mfg_reverse_document and
--                     mfg_reverse_confirmation post a linked opposite document with the opposite journal entry
--   outputs           co-/by-products of a bill of materials are copied to the order; mfg_post_output_receipt puts them
--                     into stock at their cost share (standard: the item's standard cost; actual: share of the order's cost)
--   delivery          mfg_post_delivery takes finished goods out against a sales order and posts Dr COGS / Cr inventory;
--                     mfg_create_invoice_from_so makes the customer invoice (with NO item on its lines, so the existing
--                     post_invoice posts only revenue / receivable / VAT and leaves cost to the delivery)
--
-- ROLLBACK (drops only what this file created; then re-run 0031 to restore the three redefined functions):
--   drop function if exists mfg_close_order(uuid), mfg_reverse_settlement(uuid, date, text), mfg_settle_order(uuid, date),
--     mfg_order_variances(uuid), mfg__variance_split(uuid), mfg_post_output_receipt(uuid, uuid, numeric, uuid, text, date, date, text),
--     mfg_create_invoice_from_so(uuid, date), mfg_post_delivery(uuid, date, jsonb, text),
--     mfg_reverse_confirmation(uuid, date, text), mfg_reverse_document(uuid, date, text),
--     mfg__reverse_doc(uuid, uuid, date, text), mfg__reverse_entry(uuid, uuid, date, text, text, uuid),
--     mfg__refresh_order_status(uuid), mfg__move_so(uuid, uuid, int, uuid, uuid, uuid, numeric, numeric, uuid, uuid),
--     mfg__avg_after(numeric, numeric, numeric, numeric);
--   drop table if exists mfg_invoice_links, mfg_settlements, mfg_prod_outputs;
--   alter table mfg_material_doc_lines drop column if exists so_line_id;
--   alter table mfg_order_costs drop column if exists item_id;
--   alter table mfg_production_orders drop column if exists std_mix, drop column if exists teco_at;
-- ============================================================

-- ---------- new columns on Manufacturing tables ----------
alter table mfg_material_doc_lines add column if not exists so_line_id uuid;          -- the sales-order line a delivery was against
create index if not exists mfg_material_doc_lines_so on mfg_material_doc_lines (so_line_id) where so_line_id is not null;
alter table mfg_order_costs add column if not exists item_id uuid;                      -- which output a RELIEF row belongs to
alter table mfg_production_orders add column if not exists std_mix jsonb;               -- element mix of the standard cost, for the variance split
alter table mfg_production_orders add column if not exists teco_at timestamptz;

-- ---------- new tables ----------
create table if not exists mfg_prod_outputs (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  order_id       uuid not null references mfg_production_orders(id) on delete cascade,
  line_no        int not null,
  item_id        uuid not null references items(id) on delete cascade,
  kind           text not null check (kind in ('COPRODUCT', 'BYPRODUCT')),
  cost_share_pct numeric(7, 3) not null default 0 check (cost_share_pct >= 0 and cost_share_pct <= 100),
  qty_planned    numeric(18, 6) not null check (qty_planned > 0),
  qty_received   numeric(18, 6) not null default 0,
  unique (order_id, item_id)
);

create table if not exists mfg_settlements (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  document_number  text,
  order_id         uuid not null references mfg_production_orders(id) on delete cascade,
  posting_date     date not null,
  residual         numeric(18, 2) not null default 0,       -- what was left in work in process (negative on a reversal)
  detail           jsonb not null default '{}'::jsonb,       -- the variance lines and the scrap memo
  reversal_of      uuid references mfg_settlements(id),
  reason           text,
  journal_entry_id uuid references journal_entries(id) on delete set null,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);
create index if not exists mfg_settlements_order on mfg_settlements (order_id);

create table if not exists mfg_invoice_links (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  so_line_id uuid not null,
  invoice_id uuid not null references invoices(id) on delete cascade,
  qty        numeric(18, 6) not null
);
create index if not exists mfg_invoice_links_line on mfg_invoice_links (so_line_id);

alter table mfg_prod_outputs enable row level security;
alter table mfg_settlements enable row level security;
alter table mfg_invoice_links enable row level security;
do $$
declare t text;
begin
  foreach t in array array['mfg_prod_outputs', 'mfg_settlements', 'mfg_invoice_links'] loop
    execute format('drop policy if exists "mfg read" on %I', t);
    execute format($f$create policy "mfg read" on %I for select
      using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING')$f$, t);
  end loop;
end $$;

drop trigger if exists trg_mfg_settlement_number on mfg_settlements;
create trigger trg_mfg_settlement_number before insert on mfg_settlements
  for each row execute function mfg_assign_number('settlement', 'SET');
drop trigger if exists trg_mfg_no_edit_settlement on mfg_settlements;
create trigger trg_mfg_no_edit_settlement before update or delete on mfg_settlements
  for each row execute function mfg_block_mutation();

-- ---------- helpers ----------
-- Moving average after a signed quantity change at a unit cost (actual costing): used when a movement is reversed.
create or replace function mfg__avg_after(p_old_qty numeric, p_avg numeric, p_qty numeric, p_unit numeric)
returns numeric as $$
  select case when greatest(coalesce(p_old_qty, 0), 0) + p_qty <= 0 then coalesce(p_avg, 0)
              else round((greatest(coalesce(p_old_qty, 0), 0) * coalesce(p_avg, 0) + p_qty * p_unit)
                         / (greatest(coalesce(p_old_qty, 0), 0) + p_qty), 6) end;
$$ language sql immutable;

-- mfg__move, with the sales-order line a delivery line belongs to.
create or replace function mfg__move_so(p_doc uuid, p_tenant uuid, p_line_no int, p_item uuid, p_loc uuid, p_batch uuid,
                                        p_qty numeric, p_unit_cost numeric, p_po_line uuid, p_so_line uuid)
returns void as $$
begin
  insert into mfg_material_doc_lines (tenant_id, doc_id, line_no, item_id, location_id, batch_id, qty_change, unit_cost, total_cost, po_line_id, so_line_id)
  values (p_tenant, p_doc, p_line_no, p_item, p_loc, p_batch, p_qty, p_unit_cost, round(p_qty * p_unit_cost, 6), p_po_line, p_so_line);
  update mfg_stock set qty = qty + p_qty
   where tenant_id = p_tenant and item_id = p_item and location_id = p_loc and batch_id is not distinct from p_batch;
  if not found then
    insert into mfg_stock (tenant_id, item_id, location_id, batch_id, qty) values (p_tenant, p_item, p_loc, p_batch, p_qty);
  end if;
  update items set qty_on_hand = qty_on_hand + p_qty where id = p_item;
end;
$$ language plpgsql security definer set search_path = public;

-- Work out the status an order should have from what has been confirmed and received (after a reversal).
create or replace function mfg__refresh_order_status(p_order uuid)
returns void as $$
declare
  o mfg_production_orders; v_final boolean; v_any boolean;
begin
  select * into o from mfg_production_orders where id = p_order;
  if o.status not in ('RELEASED', 'PARTIALLY_CONFIRMED', 'CONFIRMED', 'DELIVERED') then return; end if;
  select exists (select 1 from mfg_confirmations c where c.order_id = p_order and c.reversal_of is null and c.is_final
                    and not exists (select 1 from mfg_confirmations r where r.reversal_of = c.id)),
         exists (select 1 from mfg_confirmations c where c.order_id = p_order and c.reversal_of is null
                    and not exists (select 1 from mfg_confirmations r where r.reversal_of = c.id))
    into v_final, v_any;
  update mfg_production_orders set status = case
      when v_final and qty_good > 0 and qty_received >= qty_good - 0.000001 then 'DELIVERED'
      when v_final then 'CONFIRMED'
      when v_any or qty_received > 0 then 'PARTIALLY_CONFIRMED'
      else 'RELEASED' end
   where id = p_order;
end;
$$ language plpgsql security definer set search_path = public;

-- The opposite of a journal entry: same accounts, debits and credits swapped.
create or replace function mfg__reverse_entry(p_tenant uuid, p_je uuid, p_date date, p_memo text, p_src_table text, p_src_id uuid)
returns uuid as $$
declare
  v_lines jsonb;
begin
  if p_je is null then return null; end if;
  select jsonb_agg(jsonb_build_object('account_id', account_id, 'debit', credit, 'credit', debit)) into v_lines
    from journal_lines where journal_entry_id = p_je;
  return mfg__post_entry(p_tenant, p_date, p_memo, p_src_table, p_src_id, v_lines);
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- production orders: co-/by-product outputs and the standard-cost mix are copied at creation ----------
create or replace function mfg_create_order(p_item uuid, p_qty numeric, p_start date default current_date, p_end date default null,
                                            p_bom_alt int default 1, p_routing_alt int default 1, p_backflush boolean default false)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text := mfg__method(v_t);
  v_name text; v_bom uuid; v_rt uuid; v_std numeric := 0; v_id uuid; c record; o record; n int := 0; b record; v_base numeric;
  est record; v_mix jsonb; v_lines numeric; m_mat numeric; m_lab numeric; m_mach numeric; m_voh numeric; m_fix numeric; v_sub numeric;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity above zero.'; end if;
  select i.name into v_name from items i join mfg_item_master m on m.item_id = i.id
   where i.id = p_item and i.tenant_id = v_t and m.make_or_buy = 'MAKE' and m.active;
  if v_name is null then raise exception 'Choose an item you make. Only items marked "Make" can be produced.'; end if;
  v_bom := mfg_active_bom(v_t, p_item, coalesce(p_start, current_date), p_bom_alt);
  if v_bom is null then raise exception 'There is no active bill of materials for "%" on %. Activate one first.', v_name, to_char(coalesce(p_start, current_date), 'Mon DD, YYYY'); end if;
  if v_method = 'STANDARD' then v_std := mfg__item_cost(v_t, p_item); end if;
  select id into v_rt from mfg_routings where tenant_id = v_t and item_id = p_item and alt_no = p_routing_alt and status = 'ACTIVE';

  -- the element mix of the released standard cost: how much of one unit is material, labor, machine and overhead
  if v_method = 'STANDARD' then
    select e.id, e.total_cost into est from mfg_cost_estimates e
     where e.tenant_id = v_t and e.item_id = p_item and e.status = 'RELEASED' order by e.released_at desc nulls last limit 1;
    if est.id is not null and est.total_cost > 0 then
      select coalesce(sum(amount) filter (where element = 'MATERIAL'), 0), coalesce(sum(amount) filter (where element = 'LABOR'), 0),
             coalesce(sum(amount) filter (where element = 'MACHINE'), 0), coalesce(sum(amount) filter (where element = 'VAR_OH'), 0),
             coalesce(sum(amount) filter (where element = 'FIX_OH'), 0), coalesce(sum(amount), 0)
        into m_mat, m_lab, m_mach, m_voh, m_fix, v_lines
        from mfg_cost_estimate_lines where estimate_id = est.id and level = 0 and item_id = p_item;
      v_sub := greatest(est.total_cost - v_lines, 0);                         -- sub-assemblies are issued as material
      v_mix := jsonb_build_object('MATERIAL', round((m_mat + v_sub) / (v_lines + v_sub), 8), 'LABOR', round(m_lab / (v_lines + v_sub), 8),
                                  'MACHINE', round(m_mach / (v_lines + v_sub), 8), 'VAR_OH', round(m_voh / (v_lines + v_sub), 8),
                                  'FIX_OH', round(m_fix / (v_lines + v_sub), 8));
    end if;
  end if;

  insert into mfg_production_orders (tenant_id, item_id, bom_id, routing_id, qty_planned, planned_start, planned_end, costing_method,
                                     std_unit_cost, planned_cost, bom_snapshot, std_mix)
  values (v_t, p_item, v_bom, v_rt, p_qty, coalesce(p_start, current_date), p_end, v_method, v_std, round(p_qty * v_std, 2),
          (select jsonb_build_object('bom', b2.document_number, 'version', b2.version, 'alt', b2.alt_no, 'yield_pct', b2.yield_pct) from mfg_boms b2 where b2.id = v_bom),
          v_mix)
  returning id into v_id;

  for c in select * from mfg__order_components(v_t, v_bom, p_qty, coalesce(p_start, current_date)) loop
    n := n + 1;
    insert into mfg_prod_components (tenant_id, order_id, line_no, item_id, qty_required, backflush)
    values (v_t, v_id, n, c.item_id, c.qty, coalesce(p_backflush, false));
  end loop;
  if v_rt is not null then
    insert into mfg_prod_operations (tenant_id, order_id, op_no, description, work_center_id, setup_min, run_min_per_unit,
                                     labor_min_per_unit, machine_min_per_unit, teardown_min)
    select v_t, v_id, ro.op_no, ro.description, ro.work_center_id, ro.setup_min, ro.run_min_per_unit,
           ro.labor_min_per_unit, ro.machine_min_per_unit, ro.teardown_min
      from mfg_routing_ops ro where ro.routing_id = v_rt;
  end if;

  select base_qty into v_base from mfg_boms where id = v_bom;
  n := 0;
  for b in select bi.*, m.base_uom as out_uom from mfg_bom_items bi join mfg_item_master m on m.item_id = bi.component_item_id
            where bi.bom_id = v_bom and bi.kind <> 'COMPONENT' order by bi.line_no loop
    n := n + 1;
    insert into mfg_prod_outputs (tenant_id, order_id, line_no, item_id, kind, cost_share_pct, qty_planned)
    values (v_t, v_id, n, b.component_item_id, b.kind, b.cost_share_pct,
            greatest(round(mfg_convert_qty(v_t, b.component_item_id, p_qty / v_base * b.qty, b.uom, b.out_uom), 6), 0.000001))
    on conflict (order_id, item_id) do nothing;
  end loop;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- confirmation: the backflush issue is tied to its confirmation so both can be reversed together ----------
create or replace function mfg_post_confirmation(p_order uuid, p_op_no int, p_yield numeric, p_scrap numeric, p_scrap_reason text,
                                                 p_setup_h numeric, p_labor_h numeric, p_machine_h numeric, p_final boolean, p_date date,
                                                 p_employee uuid default null, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text := mfg__method(v_t);
  o mfg_production_orders; op record; v_last int; v_has_ops boolean; v_id uuid; v_je uuid; v_date date := coalesce(p_date, current_date);
  y numeric := coalesce(p_yield, 0); s numeric := coalesce(p_scrap, 0); sh numeric := coalesce(p_setup_h, 0); lh numeric := coalesce(p_labor_h, 0); mh numeric := coalesce(p_machine_h, 0);
  at_labor uuid; at_machine uuid; at_setup uuid; rate_l numeric; rate_m numeric; rate_s numeric; v_emp numeric; wcname text;
  v_lab numeric := 0; v_mach numeric := 0; v_fix numeric := 0; v_var numeric := 0; cs record; hrs numeric; amt numeric; v_lines jsonb := '[]'::jsonb;
  comp record; v_bf jsonb := '[]'::jsonb; v_is_last boolean;
begin
  if p_key is not null then
    select id into v_id from mfg_confirmations where tenant_id = v_t and idempotency_key = p_key;
    if v_id is not null then return v_id; end if;
  end if;
  select * into o from mfg_production_orders where id = p_order and tenant_id = v_t for update;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  if o.status not in ('RELEASED', 'PARTIALLY_CONFIRMED') then
    raise exception 'Production can be confirmed only on a released order that isn''t finished (this one is %).', lower(replace(o.status, '_', ' '));
  end if;
  if y < 0 or s < 0 or sh < 0 or lh < 0 or mh < 0 then raise exception 'Quantities and hours can''t be negative.'; end if;
  if y + s = 0 and sh + lh + mh = 0 then raise exception 'Enter the units made or the hours worked.'; end if;

  select exists (select 1 from mfg_prod_operations where order_id = p_order), (select max(op_no) from mfg_prod_operations where order_id = p_order) into v_has_ops, v_last;
  if v_has_ops then
    select * into op from mfg_prod_operations where order_id = p_order and op_no = p_op_no;
    if op.id is null then raise exception 'Choose the operation you are confirming.'; end if;
    v_is_last := (p_op_no = v_last);
  else
    if p_op_no is not null then raise exception 'This order has no operations to confirm against.'; end if;
    v_is_last := true;
  end if;
  if p_final and not v_is_last then raise exception 'Only the last operation can be the final confirmation.'; end if;

  if v_has_ops and (sh + lh + mh) > 0 then
    select id into at_labor from mfg_activity_types where tenant_id = v_t and kind = 'LABOR' order by code limit 1;
    select id into at_machine from mfg_activity_types where tenant_id = v_t and kind = 'MACHINE' order by code limit 1;
    select id into at_setup from mfg_activity_types where tenant_id = v_t and kind = 'SETUP' order by code limit 1;
    select name into wcname from mfg_work_centers where id = op.work_center_id;
    rate_l := mfg_activity_rate(op.work_center_id, at_labor, v_date);
    rate_m := mfg_activity_rate(op.work_center_id, at_machine, v_date);
    rate_s := coalesce(mfg_activity_rate(op.work_center_id, at_setup, v_date), rate_l);
    if v_method = 'ACTUAL' and p_employee is not null then
      select case when pay_type = 'hourly' then hourly_rate else salary / 12 / 173.33 end into v_emp from employees where id = p_employee and tenant_id = v_t;
      if coalesce(v_emp, 0) > 0 then rate_l := v_emp; rate_s := v_emp; end if;
    end if;
    if lh > 0 and rate_l is null then raise exception 'Work center "%" has no planned labor rate for %. Add one under Master Data → Activity rates.', wcname, to_char(v_date, 'Mon YYYY'); end if;
    if sh > 0 and rate_s is null then raise exception 'Work center "%" has no planned setup or labor rate for %. Add one under Master Data → Activity rates.', wcname, to_char(v_date, 'Mon YYYY'); end if;
    if mh > 0 and rate_m is null then raise exception 'Work center "%" has no planned machine rate for %. Add one under Master Data → Activity rates.', wcname, to_char(v_date, 'Mon YYYY'); end if;
    v_lab := round(lh * coalesce(rate_l, 0), 2) + round(sh * coalesce(rate_s, 0), 2);
    v_mach := round(mh * coalesce(rate_m, 0), 2);
    for cs in select * from mfg_costing_sheet where tenant_id = v_t and active loop
      hrs := case cs.hour_basis when 'LABOR' then lh + sh else mh end;
      amt := round(hrs * cs.oh_rate_per_hour + case when cs.base in ('LABOR', 'BOTH') then v_lab * cs.oh_pct / 100 else 0 end, 2);
      if cs.kind = 'FIXED' then v_fix := v_fix + amt; else v_var := v_var + amt; end if;
    end loop;
  end if;

  v_id := gen_random_uuid();
  if v_is_last and (y + s) > 0 then
    for comp in select * from mfg_prod_components where order_id = p_order and backflush order by line_no loop
      v_bf := v_bf || jsonb_build_object('component_id', comp.id, 'qty', round(comp.qty_required / o.qty_planned * (y + s), 6));
    end loop;
    if jsonb_array_length(v_bf) > 0 then
      perform mfg__issue_components(v_t, p_order, v_bf, v_date, null, 'Backflush for production confirmation ' || v_id);
    end if;
  end if;

  if (v_lab + v_mach + v_fix + v_var) > 0 then
    v_lines := jsonb_build_array(jsonb_build_object('key', 'WIP', 'debit', v_lab + v_mach + v_fix + v_var));
    if v_lab <> 0 then v_lines := v_lines || jsonb_build_object('key', 'APPLIED_LABOR', 'credit', v_lab); end if;
    if v_mach + v_var <> 0 then v_lines := v_lines || jsonb_build_object('key', 'APPLIED_MACHINE', 'credit', v_mach + v_var); end if;
    if v_fix <> 0 then v_lines := v_lines || jsonb_build_object('key', 'APPLIED_FIXED_OH', 'credit', v_fix); end if;
    v_je := mfg__post_entry(v_t, v_date, 'Production confirmation on order ' || coalesce(o.document_number, ''), 'mfg_confirmations', v_id, v_lines);
  end if;
  insert into mfg_confirmations (id, tenant_id, order_id, op_no, posting_date, yield_qty, scrap_qty, scrap_reason, setup_h, labor_h, machine_h,
                                 employee_id, labor_cost, machine_cost, fixed_oh_cost, var_oh_cost, is_final, journal_entry_id, idempotency_key)
  values (v_id, v_t, p_order, p_op_no, v_date, y, s, nullif(trim(p_scrap_reason), ''), sh, lh, mh, p_employee, v_lab, v_mach, v_fix, v_var, coalesce(p_final, false), v_je, p_key);
  if v_lab <> 0 then insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount) values (v_t, p_order, v_date, 'CONFIRMATION', v_id, 'LABOR', v_lab); end if;
  if v_mach <> 0 then insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount) values (v_t, p_order, v_date, 'CONFIRMATION', v_id, 'MACHINE', v_mach); end if;
  if v_fix <> 0 then insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount) values (v_t, p_order, v_date, 'CONFIRMATION', v_id, 'FIX_OH', v_fix); end if;
  if v_var <> 0 then insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount) values (v_t, p_order, v_date, 'CONFIRMATION', v_id, 'VAR_OH', v_var); end if;

  if v_has_ops then
    update mfg_prod_operations set qty_confirmed = qty_confirmed + y, setup_h_actual = setup_h_actual + sh,
           labor_h_actual = labor_h_actual + lh, machine_h_actual = machine_h_actual + mh where id = op.id;
  end if;
  update mfg_production_orders
     set qty_scrap = qty_scrap + s,
         qty_good = qty_good + case when v_is_last then y else 0 end,
         status = case when coalesce(p_final, false) then 'CONFIRMED' else 'PARTIALLY_CONFIRMED' end
   where id = p_order;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- finished goods receipt: under actual costing the main item takes only its share of the order's cost ----------
create or replace function mfg_post_fg_receipt(p_order uuid, p_qty numeric, p_location uuid, p_batch_no text, p_expiry date, p_date date, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text := mfg__method(v_t);
  o mfg_production_orders; v_doc uuid; v_docno text; v_je uuid; v_date date := coalesce(p_date, current_date);
  it record; v_key text; v_avail numeric; v_unit numeric; v_amt numeric; v_loc uuid; v_batch uuid; v_oldqty numeric; v_avg numeric;
  v_share numeric; v_gross numeric; v_done numeric; v_pool numeric;
begin
  if p_key is not null then
    select id into v_doc from mfg_material_documents where tenant_id = v_t and idempotency_key = p_key;
    if v_doc is not null then return v_doc; end if;
  end if;
  select * into o from mfg_production_orders where id = p_order and tenant_id = v_t for update;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  if o.status not in ('PARTIALLY_CONFIRMED', 'CONFIRMED') then
    raise exception 'Finished goods can be received only after production has been confirmed (this order is %).', lower(replace(o.status, '_', ' '));
  end if;
  v_avail := o.qty_good - o.qty_received;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter the quantity you are putting into stock.'; end if;
  if p_qty > v_avail + 0.000001 then raise exception 'Only % good units are waiting to be received (% confirmed, % already in stock).', v_avail, o.qty_good, o.qty_received; end if;
  select i.name, m.item_type, m.default_location_id, m.batch_tracked, m.moving_avg_cost into it from items i join mfg_item_master m on m.item_id = i.id where i.id = o.item_id;
  v_key := mfg__inv_key(it.item_type);
  if v_key is null then raise exception '"%" can''t be put into stock.', it.name; end if;
  v_loc := coalesce(p_location, it.default_location_id, (select id from mfg_storage_locations where tenant_id = v_t and code = 'FG-STORE'));
  if not exists (select 1 from mfg_storage_locations where id = v_loc and tenant_id = v_t and kind <> 'WIP') then raise exception 'Choose the store the finished goods go into.'; end if;

  if v_method = 'STANDARD' then
    v_unit := o.std_unit_cost;
    v_amt := round(p_qty * v_unit, 2);
  else
    -- the main item's pool: everything the order has cost, less the share that co-/by-products take, less what was already relieved
    select coalesce(sum(cost_share_pct), 0) into v_share from mfg_prod_outputs where order_id = p_order;
    select coalesce(sum(amount) filter (where element not in ('RELIEF', 'VARIANCE')), 0),
           -coalesce(sum(amount) filter (where element = 'RELIEF' and (item_id is null or item_id = o.item_id)), 0)
      into v_gross, v_done from mfg_order_costs where order_id = p_order;
    v_pool := round(v_gross * (100 - v_share) / 100, 2) - v_done;
    if abs(p_qty - v_avail) < 0.000001 then
      v_amt := v_pool;
    else
      v_amt := round(p_qty * v_pool / v_avail, 2);
    end if;
    v_unit := round(v_amt / p_qty, 6);
    select coalesce(sum(qty), 0) into v_oldqty from mfg_stock where tenant_id = v_t and item_id = o.item_id;
    v_avg := mfg_moving_average(v_oldqty, it.moving_avg_cost, p_qty, v_unit);
    update mfg_item_master set moving_avg_cost = v_avg where item_id = o.item_id;
    update items set unit_cost = v_avg where id = o.item_id;
  end if;

  v_doc := mfg__doc(v_t, 'FGR', v_date, 'mfg_production_orders', p_order, 'Finished goods receipt', p_key);
  select document_number into v_docno from mfg_material_documents where id = v_doc;
  if it.batch_tracked then
    v_batch := mfg__batch(v_t, o.item_id, coalesce(nullif(trim(p_batch_no), ''), v_docno), v_date, p_expiry);
  end if;
  perform mfg__move(v_doc, v_t, 1, o.item_id, v_loc, v_batch, p_qty, v_unit, null);
  v_je := mfg__post_entry(v_t, v_date, 'Finished goods receipt ' || v_docno || ' from order ' || coalesce(o.document_number, ''), 'mfg_material_documents', v_doc,
    jsonb_build_array(jsonb_build_object('key', v_key, 'debit', v_amt), jsonb_build_object('key', 'WIP', 'credit', v_amt)));
  update mfg_material_documents set journal_entry_id = v_je where id = v_doc;
  insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount, item_id)
  values (v_t, p_order, v_date, 'RECEIPT', v_doc, 'RELIEF', -v_amt, o.item_id);
  update mfg_production_orders
     set qty_received = qty_received + p_qty,
         status = case when status = 'CONFIRMED' and qty_received + p_qty >= qty_good - 0.000001 then 'DELIVERED' else status end
   where id = p_order;
  return v_doc;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- co-products and by-products into stock ----------
create or replace function mfg_post_output_receipt(p_order uuid, p_output uuid, p_qty numeric, p_location uuid, p_batch_no text, p_expiry date,
                                                   p_date date, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text := mfg__method(v_t);
  o mfg_production_orders; po mfg_prod_outputs; v_doc uuid; v_docno text; v_je uuid; v_date date := coalesce(p_date, current_date);
  it record; v_key text; v_remaining numeric; v_unit numeric := 0; v_amt numeric := 0; v_loc uuid; v_batch uuid; v_oldqty numeric;
  v_gross numeric; v_done numeric; v_pool numeric; v_lines jsonb;
begin
  if p_key is not null then
    select id into v_doc from mfg_material_documents where tenant_id = v_t and idempotency_key = p_key;
    if v_doc is not null then return v_doc; end if;
  end if;
  select * into o from mfg_production_orders where id = p_order and tenant_id = v_t for update;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  if o.status not in ('PARTIALLY_CONFIRMED', 'CONFIRMED', 'DELIVERED') then
    raise exception 'Co-products and by-products can be received only once production has been confirmed (this order is %).', lower(replace(o.status, '_', ' '));
  end if;
  select * into po from mfg_prod_outputs where id = p_output and order_id = p_order;
  if po.id is null then raise exception 'That co-product or by-product is not on this order.'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter the quantity you are putting into stock.'; end if;
  v_remaining := po.qty_planned - po.qty_received;
  if p_qty > v_remaining + 0.000001 then
    raise exception 'The order expected % of this output and % is already in stock, so only % more can be received.', po.qty_planned, po.qty_received, v_remaining;
  end if;
  select i.name, m.item_type, m.default_location_id, m.batch_tracked, m.moving_avg_cost into it from items i join mfg_item_master m on m.item_id = i.id where i.id = po.item_id;
  v_key := mfg__inv_key(it.item_type);
  if v_key is null then raise exception '"%" can''t be put into stock.', it.name; end if;
  v_loc := coalesce(p_location, it.default_location_id, (select id from mfg_storage_locations where tenant_id = v_t and code = case it.item_type when 'FINISHED' then 'FG-STORE' else 'RM-STORE' end));
  if not exists (select 1 from mfg_storage_locations where id = v_loc and tenant_id = v_t and kind <> 'WIP') then raise exception 'Choose the store it goes into.'; end if;

  if po.cost_share_pct > 0 then
    if v_method = 'STANDARD' then
      v_unit := mfg__item_cost(v_t, po.item_id);
      v_amt := round(p_qty * v_unit, 2);
    else
      select coalesce(sum(amount) filter (where element not in ('RELIEF', 'VARIANCE')), 0),
             -coalesce(sum(amount) filter (where element = 'RELIEF' and item_id = po.item_id), 0)
        into v_gross, v_done from mfg_order_costs where order_id = p_order;
      v_pool := round(v_gross * po.cost_share_pct / 100, 2) - v_done;
      if abs(p_qty - v_remaining) < 0.000001 then v_amt := v_pool; else v_amt := round(p_qty * v_pool / v_remaining, 2); end if;
      v_unit := round(v_amt / p_qty, 6);
      select coalesce(sum(qty), 0) into v_oldqty from mfg_stock where tenant_id = v_t and item_id = po.item_id;
      update mfg_item_master set moving_avg_cost = mfg_moving_average(v_oldqty, it.moving_avg_cost, p_qty, v_unit) where item_id = po.item_id;
      update items set unit_cost = (select moving_avg_cost from mfg_item_master where item_id = po.item_id) where id = po.item_id;
    end if;
  end if;

  v_doc := mfg__doc(v_t, 'FGR', v_date, 'mfg_production_orders', p_order, 'Co-/by-product receipt', p_key);
  select document_number into v_docno from mfg_material_documents where id = v_doc;
  if it.batch_tracked then
    v_batch := mfg__batch(v_t, po.item_id, coalesce(nullif(trim(p_batch_no), ''), v_docno), v_date, p_expiry);
  end if;
  perform mfg__move(v_doc, v_t, 1, po.item_id, v_loc, v_batch, p_qty, v_unit, null);
  if v_amt <> 0 then
    v_lines := jsonb_build_array(jsonb_build_object('key', v_key, 'debit', v_amt), jsonb_build_object('key', 'WIP', 'credit', v_amt));
    v_je := mfg__post_entry(v_t, v_date, 'Co-/by-product receipt ' || v_docno || ' from order ' || coalesce(o.document_number, ''), 'mfg_material_documents', v_doc, v_lines);
    update mfg_material_documents set journal_entry_id = v_je where id = v_doc;
    insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount, item_id)
    values (v_t, p_order, v_date, 'RECEIPT', v_doc, 'RELIEF', -v_amt, po.item_id);
  end if;
  update mfg_prod_outputs set qty_received = qty_received + p_qty where id = po.id;
  return v_doc;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- reversing a stock document ----------
create or replace function mfg__reverse_doc(p_tenant uuid, p_doc uuid, p_date date, p_reason text)
returns uuid as $$
declare
  v_method text := mfg__method(p_tenant);
  d mfg_material_documents; o mfg_production_orders; rev uuid; v_je uuid; l record; n int := 0; v_oldqty numeric; v_avg numeric; v_rev_qty numeric;
  c record; take numeric; left_q numeric; v_po uuid; po_row mfg_prod_outputs; sl uuid; v_deliv numeric; v_inv numeric;
begin
  select * into d from mfg_material_documents where id = p_doc and tenant_id = p_tenant;
  if d.id is null then raise exception 'That stock document was not found.'; end if;
  if d.doc_type = 'REV' then raise exception 'A reversal can''t be reversed. Post the movement again instead.'; end if;
  if exists (select 1 from mfg_material_documents where reversal_of = p_doc) then raise exception '% has already been reversed.', d.document_number; end if;
  if p_date < d.posting_date then raise exception 'The reversal can''t be dated before the document it reverses (%).', to_char(d.posting_date, 'Mon DD, YYYY'); end if;
  if d.reference_type = 'mfg_production_orders' then
    select * into o from mfg_production_orders where id = d.reference_id for update;
    if o.status in ('TECHNICALLY_COMPLETE', 'CLOSED', 'CANCELLED') then
      raise exception 'Order % is % — reverse its settlement first.', o.document_number, lower(replace(o.status, '_', ' '));
    end if;
  end if;

  insert into mfg_material_documents (tenant_id, document_number, doc_type, posting_date, reference_type, reference_id, memo, reversal_of)
  values (p_tenant, next_doc_number(p_tenant, 'mat_REV', 'REV'), 'REV', p_date, d.reference_type, d.reference_id,
          'Reversal of ' || d.document_number || coalesce(': ' || nullif(trim(p_reason), ''), ''), p_doc)
  returning id into rev;

  for l in select * from mfg_material_doc_lines where doc_id = p_doc order by line_no loop
    n := n + 1;
    v_rev_qty := -l.qty_change;
    if v_method = 'ACTUAL' then
      select coalesce(sum(qty), 0) into v_oldqty from mfg_stock where tenant_id = p_tenant and item_id = l.item_id;
      select moving_avg_cost into v_avg from mfg_item_master where item_id = l.item_id;
      v_avg := mfg__avg_after(v_oldqty, v_avg, v_rev_qty, l.unit_cost);
      update mfg_item_master set moving_avg_cost = v_avg where item_id = l.item_id;
      update items set unit_cost = v_avg where id = l.item_id;
    end if;
    perform mfg__move_so(rev, p_tenant, n, l.item_id, l.location_id, l.batch_id, v_rev_qty, l.unit_cost, l.po_line_id, l.so_line_id);
  end loop;

  v_je := mfg__reverse_entry(p_tenant, d.journal_entry_id, p_date, 'Reversal of ' || d.document_number, 'mfg_material_documents', rev);
  if v_je is not null then update mfg_material_documents set journal_entry_id = v_je where id = rev; end if;

  if d.reference_type = 'mfg_production_orders' then
    if d.doc_type = 'GI' then
      -- give the issued quantities back to the components
      for l in select item_id, sum(-qty_change) as q from mfg_material_doc_lines where doc_id = p_doc group by item_id loop
        left_q := l.q;
        for c in select * from mfg_prod_components where order_id = o.id and item_id = l.item_id and qty_issued > 0 order by line_no desc loop
          exit when left_q <= 0;
          take := least(left_q, c.qty_issued);
          update mfg_prod_components set qty_issued = qty_issued - take where id = c.id;
          left_q := left_q - take;
        end loop;
      end loop;
    elsif d.doc_type = 'FGR' then
      for l in select item_id, sum(qty_change) as q from mfg_material_doc_lines where doc_id = p_doc group by item_id loop
        if l.item_id = o.item_id then
          update mfg_production_orders set qty_received = qty_received - l.q where id = o.id;
        else
          update mfg_prod_outputs set qty_received = qty_received - l.q where order_id = o.id and item_id = l.item_id;
        end if;
      end loop;
    end if;
    insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount, item_id)
    select tenant_id, order_id, p_date, 'REVERSAL', rev, element, -amount, item_id
      from mfg_order_costs where source_id = p_doc and source_type in ('ISSUE', 'RECEIPT');
    perform mfg__refresh_order_status(o.id);
  elsif d.doc_type = 'GR' then
    select purchase_order_id into v_po from goods_receipts where id = d.reference_id;
    if v_po is not null then update purchase_orders set status = 'sent' where id = v_po and status = 'closed'; end if;
  elsif d.doc_type = 'DLV' then
    for sl in select distinct so_line_id from mfg_material_doc_lines where doc_id = p_doc and so_line_id is not null loop
      select coalesce(-sum(qty_change), 0) into v_deliv from mfg_material_doc_lines where so_line_id = sl;
      select coalesce(sum(il.qty), 0) into v_inv from mfg_invoice_links il join invoices i on i.id = il.invoice_id where il.so_line_id = sl and i.status <> 'void';
      if v_inv > v_deliv + 0.000001 then
        raise exception 'Some of these goods have already been invoiced. Void the invoice first, then reverse the delivery.';
      end if;
    end loop;
  end if;

  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (p_tenant, 'stock_document_reversed', jsonb_build_object('document', d.document_number, 'reversal', rev, 'reason', p_reason), auth.uid());
  return rev;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_reverse_document(p_doc uuid, p_date date default current_date, p_reason text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are reversing it — the reason stays on the record.'; end if;
  return mfg__reverse_doc(v_t, p_doc, coalesce(p_date, current_date), p_reason);
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- reversing a production confirmation ----------
create or replace function mfg_reverse_confirmation(p_conf uuid, p_date date default current_date, p_reason text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_date date := coalesce(p_date, current_date);
  c mfg_confirmations; o mfg_production_orders; v_last int; v_is_last boolean; v_rev uuid; v_je uuid; bf record;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are reversing it — the reason stays on the record.'; end if;
  select * into c from mfg_confirmations where id = p_conf and tenant_id = v_t;
  if c.id is null then raise exception 'That confirmation was not found.'; end if;
  if c.reversal_of is not null then raise exception 'A reversal can''t be reversed. Post the confirmation again instead.'; end if;
  if exists (select 1 from mfg_confirmations where reversal_of = p_conf) then raise exception 'That confirmation has already been reversed.'; end if;
  if v_date < c.posting_date then raise exception 'The reversal can''t be dated before the confirmation (%).', to_char(c.posting_date, 'Mon DD, YYYY'); end if;
  select * into o from mfg_production_orders where id = c.order_id for update;
  if o.status in ('TECHNICALLY_COMPLETE', 'CLOSED', 'CANCELLED') then
    raise exception 'Order % is % — reverse its settlement first.', o.document_number, lower(replace(o.status, '_', ' '));
  end if;
  select max(op_no) into v_last from mfg_prod_operations where order_id = o.id;
  v_is_last := v_last is null or c.op_no = v_last;
  if v_is_last and c.yield_qty > 0 and (o.qty_good - c.yield_qty) < o.qty_received - 0.000001 then
    raise exception 'Of the % good units this confirmation made, some are already in stock. Reverse the finished goods receipt first.', c.yield_qty;
  end if;

  -- the materials a backflush took out when this was confirmed come back with it
  for bf in select id from mfg_material_documents
             where doc_type = 'GI' and reference_id = o.id and memo = 'Backflush for production confirmation ' || c.id
               and not exists (select 1 from mfg_material_documents r where r.reversal_of = mfg_material_documents.id) loop
    perform mfg__reverse_doc(v_t, bf.id, v_date, 'confirmation ' || coalesce(c.document_number, '') || ' reversed');
  end loop;

  v_rev := gen_random_uuid();
  v_je := mfg__reverse_entry(v_t, c.journal_entry_id, v_date, 'Reversal of confirmation ' || coalesce(c.document_number, '') , 'mfg_confirmations', v_rev);
  insert into mfg_confirmations (id, tenant_id, order_id, op_no, posting_date, yield_qty, scrap_qty, scrap_reason, setup_h, labor_h, machine_h,
                                 employee_id, labor_cost, machine_cost, fixed_oh_cost, var_oh_cost, is_final, reversal_of, journal_entry_id)
  values (v_rev, v_t, c.order_id, c.op_no, v_date, -c.yield_qty, -c.scrap_qty, nullif(trim(p_reason), ''), -c.setup_h, -c.labor_h, -c.machine_h,
          c.employee_id, -c.labor_cost, -c.machine_cost, -c.fixed_oh_cost, -c.var_oh_cost, false, c.id, v_je);
  insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount)
  select tenant_id, order_id, v_date, 'REVERSAL', v_rev, element, -amount from mfg_order_costs where source_id = c.id and source_type = 'CONFIRMATION';

  update mfg_prod_operations set qty_confirmed = qty_confirmed - c.yield_qty, setup_h_actual = setup_h_actual - c.setup_h,
         labor_h_actual = labor_h_actual - c.labor_h, machine_h_actual = machine_h_actual - c.machine_h
   where order_id = o.id and op_no = c.op_no;
  update mfg_production_orders set qty_scrap = qty_scrap - c.scrap_qty, qty_good = qty_good - case when v_is_last then c.yield_qty else 0 end where id = o.id;
  perform mfg__refresh_order_status(o.id);
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'confirmation_reversed', jsonb_build_object('confirmation', c.document_number, 'reversal', v_rev, 'reason', p_reason), auth.uid());
  return v_rev;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- variances: what was left in work in process, split by cost element ----------
create or replace function mfg__variance_split(p_order uuid)
returns table (bucket text, account_key text, label text, actual numeric, target numeric, variance numeric) as $$
declare
  o mfg_production_orders; a_mat numeric; a_lab numeric; a_mach numeric; a_fix numeric; v_relief numeric; v_resid numeric; mix jsonb;
  t_mat numeric; t_lab numeric; t_mach numeric; t_fix numeric;
begin
  select * into o from mfg_production_orders where id = p_order;
  select coalesce(sum(amount) filter (where element = 'MATERIAL'), 0), coalesce(sum(amount) filter (where element = 'LABOR'), 0),
         coalesce(sum(amount) filter (where element in ('MACHINE', 'VAR_OH')), 0), coalesce(sum(amount) filter (where element = 'FIX_OH'), 0),
         -coalesce(sum(amount) filter (where element = 'RELIEF'), 0)
    into a_mat, a_lab, a_mach, a_fix, v_relief from mfg_order_costs where order_id = p_order;
  v_resid := a_mat + a_lab + a_mach + a_fix - v_relief;
  if o.costing_method = 'STANDARD' then
    mix := o.std_mix;
    if mix is null then
      t_mat := v_relief; t_lab := 0; t_mach := 0; t_fix := 0;
    else
      t_mat := round(v_relief * (mix->>'MATERIAL')::numeric, 2);
      t_lab := round(v_relief * (mix->>'LABOR')::numeric, 2);
      t_mach := round(v_relief * ((mix->>'MACHINE')::numeric + (mix->>'VAR_OH')::numeric), 2);
      t_fix := v_relief - t_mat - t_lab - t_mach;
    end if;
    bucket := 'MATERIAL'; account_key := 'MATERIAL_USAGE_VAR'; label := 'Material usage variance'; actual := a_mat; target := t_mat; variance := a_mat - t_mat; return next;
    bucket := 'LABOR'; account_key := 'LABOR_EFF_VAR'; label := 'Labor efficiency variance'; actual := a_lab; target := t_lab; variance := a_lab - t_lab; return next;
    bucket := 'MACHINE'; account_key := 'MACHINE_OH_VAR'; label := 'Machine and variable overhead variance'; actual := a_mach; target := t_mach; variance := a_mach - t_mach; return next;
    bucket := 'FIX_OH'; account_key := 'FIXED_OH_VAR'; label := 'Fixed overhead variance'; actual := a_fix; target := t_fix; variance := a_fix - t_fix; return next;
  else
    bucket := 'RESIDUAL'; account_key := 'SCRAP_LOSS'; label := 'Cost not carried into stock'; actual := v_resid; target := 0; variance := v_resid; return next;
  end if;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_order_variances(p_order uuid)
returns table (bucket text, account_key text, label text, actual numeric, target numeric, variance numeric) as $$
begin
  if not exists (select 1 from mfg_production_orders where id = p_order and (tenant_id = my_tenant_id() or is_teacher())) then
    raise exception 'That production order was not found.';
  end if;
  return query select * from mfg__variance_split(p_order);
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- settlement, close and un-settle ----------
create or replace function mfg_settle_order(p_order uuid, p_date date default current_date)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_date date := coalesce(p_date, current_date);
  o mfg_production_orders; v_wip numeric; r record; v_lines jsonb := '[]'::jsonb; v_detail jsonb := '[]'::jsonb; v_sum numeric := 0; v_set uuid; v_je uuid;
  v_plug numeric;
begin
  select * into o from mfg_production_orders where id = p_order and tenant_id = v_t for update;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  if o.status not in ('CONFIRMED', 'DELIVERED') then
    raise exception 'An order can be settled once production is finished and confirmed (this one is %).', lower(replace(o.status, '_', ' '));
  end if;
  if o.qty_good > o.qty_received + 0.000001 then
    raise exception '% good units are still waiting to be put into stock. Receive them first, then settle.', o.qty_good - o.qty_received;
  end if;
  if v_date < (select max(posting_date) from mfg_order_costs where order_id = p_order) then
    raise exception 'The settlement can''t be dated before the last posting on this order.';
  end if;
  v_wip := mfg_order_wip(p_order);

  for r in select * from mfg__variance_split(p_order) loop
    v_detail := v_detail || jsonb_build_object('bucket', r.bucket, 'account_key', r.account_key, 'label', r.label,
                                               'actual', r.actual, 'target', r.target, 'variance', round(r.variance, 2));
    v_sum := v_sum + round(r.variance, 2);
  end loop;
  v_plug := v_wip - v_sum;                                       -- a cent or two of rounding
  if v_plug <> 0 then
    v_detail := jsonb_set(v_detail, '{0,variance}', to_jsonb(round((v_detail->0->>'variance')::numeric + v_plug, 2)));
  end if;
  for r in select x->>'account_key' as k, (x->>'variance')::numeric as v from jsonb_array_elements(v_detail) x loop
    if r.v > 0 then v_lines := v_lines || jsonb_build_object('key', r.k, 'debit', r.v);
    elsif r.v < 0 then v_lines := v_lines || jsonb_build_object('key', r.k, 'credit', -r.v); end if;
  end loop;
  if v_wip > 0 then v_lines := v_lines || jsonb_build_object('key', 'WIP', 'credit', v_wip);
  elsif v_wip < 0 then v_lines := v_lines || jsonb_build_object('key', 'WIP', 'debit', -v_wip); end if;

  v_set := gen_random_uuid();
  v_je := mfg__post_entry(v_t, v_date, 'Settlement of order ' || coalesce(o.document_number, ''), 'mfg_settlements', v_set, v_lines);
  insert into mfg_settlements (id, tenant_id, order_id, posting_date, residual, detail, journal_entry_id)
  values (v_set, v_t, p_order, v_date, v_wip,
          jsonb_build_object('lines', v_detail, 'scrap_qty', o.qty_scrap, 'scrap_value', round(o.qty_scrap * o.std_unit_cost, 2)), v_je);
  if v_wip <> 0 then
    insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount)
    values (v_t, p_order, v_date, 'SETTLEMENT', v_set, 'VARIANCE', -v_wip);
  end if;
  update mfg_production_orders set status = 'TECHNICALLY_COMPLETE', teco_at = now() where id = p_order;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'order_settled', jsonb_build_object('order', o.document_number, 'residual', v_wip), auth.uid());
  return v_set;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_reverse_settlement(p_order uuid, p_date date default current_date, p_reason text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_date date := coalesce(p_date, current_date);
  o mfg_production_orders; s mfg_settlements; v_rev uuid; v_je uuid;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are reversing it — the reason stays on the record.'; end if;
  select * into o from mfg_production_orders where id = p_order and tenant_id = v_t for update;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  if o.status <> 'TECHNICALLY_COMPLETE' then
    raise exception 'Only a settled order that isn''t closed yet can be re-opened (this one is %).', lower(replace(o.status, '_', ' '));
  end if;
  select * into s from mfg_settlements x where x.order_id = p_order and x.reversal_of is null
     and not exists (select 1 from mfg_settlements r where r.reversal_of = x.id) order by x.created_at desc limit 1;
  if s.id is null then raise exception 'There is no settlement to reverse on this order.'; end if;
  if v_date < s.posting_date then raise exception 'The reversal can''t be dated before the settlement.'; end if;
  v_rev := gen_random_uuid();
  v_je := mfg__reverse_entry(v_t, s.journal_entry_id, v_date, 'Reversal of settlement ' || coalesce(s.document_number, ''), 'mfg_settlements', v_rev);
  insert into mfg_settlements (id, tenant_id, order_id, posting_date, residual, detail, reversal_of, reason, journal_entry_id)
  values (v_rev, v_t, p_order, v_date, -s.residual, s.detail, s.id, trim(p_reason), v_je);
  if s.residual <> 0 then
    insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount)
    values (v_t, p_order, v_date, 'REVERSAL', v_rev, 'VARIANCE', s.residual);
  end if;
  update mfg_production_orders set status = 'CONFIRMED', teco_at = null where id = p_order;
  perform mfg__refresh_order_status(p_order);
  return v_rev;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_close_order(p_order uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  o mfg_production_orders;
begin
  select * into o from mfg_production_orders where id = p_order and tenant_id = v_t for update;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  if o.status <> 'TECHNICALLY_COMPLETE' then
    raise exception 'Settle the order first; only a settled order can be closed (this one is %).', lower(replace(o.status, '_', ' '));
  end if;
  if abs(mfg_order_wip(p_order)) > 0.004 then
    raise exception 'The order still has % in work in process, so it can''t be closed.', mfg_order_wip(p_order);
  end if;
  update mfg_production_orders set status = 'CLOSED' where id = p_order;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- delivery against a sales order ----------
create or replace function mfg_post_delivery(p_so uuid, p_date date, p_lines jsonb, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_date date := coalesce(p_date, current_date);
  so record; v_doc uuid; v_docno text; v_je uuid; ln jsonb; sl record; m record; q numeric; delivered numeric; v_loc uuid; v_unit numeric; pk record;
  v_n int := 0; v_key text; k text; amt numeric; v_keys jsonb := '{}'::jsonb; v_cogs numeric := 0; v_lines jsonb := '[]'::jsonb;
begin
  if p_key is not null then
    select id into v_doc from mfg_material_documents where tenant_id = v_t and idempotency_key = p_key;
    if v_doc is not null then return v_doc; end if;
  end if;
  select * into so from sales_orders where id = p_so and tenant_id = v_t;
  if so.id is null then raise exception 'That sales order was not found.'; end if;
  if so.status = 'draft' then raise exception 'Confirm the sales order before you deliver against it.'; end if;
  if so.status <> 'confirmed' then raise exception 'This sales order is %, so nothing more can be delivered on it.', so.status; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Enter a quantity to deliver on at least one line.'; end if;

  v_doc := mfg__doc(v_t, 'DLV', v_date, 'sales_orders', p_so, 'Delivery for sales order ' || coalesce(so.document_number, ''), p_key);
  select document_number into v_docno from mfg_material_documents where id = v_doc;

  for ln in select * from jsonb_array_elements(p_lines) loop
    q := coalesce(nullif(ln->>'qty', '')::numeric, 0);
    if q = 0 then continue; end if;
    if q < 0 then raise exception 'A delivered quantity can''t be negative.'; end if;
    select * into sl from sales_order_lines where id = nullif(ln->>'so_line_id', '')::uuid and sales_order_id = p_so;
    if sl.id is null then raise exception 'One of the lines is not on this sales order.'; end if;
    if sl.item_id is null then raise exception '"%" is not a stock item, so there is nothing to deliver for it.', sl.description; end if;
    select i.name, mm.item_type, mm.default_location_id,
           case when mfg__method(v_t) = 'STANDARD' then mm.standard_cost else mm.moving_avg_cost end as cost into m
      from items i join mfg_item_master mm on mm.item_id = i.id where i.id = sl.item_id and mm.tenant_id = v_t;
    if m.name is null then raise exception '"%" is not a Manufacturing item.', sl.description; end if;
    v_key := mfg__inv_key(m.item_type);
    if v_key is null then raise exception '"%" is a service, so there is nothing to deliver for it.', m.name; end if;
    select coalesce(-sum(qty_change), 0) into delivered from mfg_material_doc_lines where so_line_id = sl.id;
    if q > sl.qty - delivered + 0.000001 then
      raise exception '"%": ordered %, already delivered %, so only % more can be delivered.', m.name, sl.qty, delivered, sl.qty - delivered;
    end if;
    v_loc := coalesce(nullif(ln->>'location_id', '')::uuid, m.default_location_id, (select id from mfg_storage_locations where tenant_id = v_t and code = 'FG-STORE'));
    if not exists (select 1 from mfg_storage_locations where id = v_loc and tenant_id = v_t and kind <> 'WIP') then
      raise exception '"%": choose the store to deliver from.', m.name;
    end if;
    v_unit := coalesce(m.cost, 0);
    for pk in select * from mfg__pick(v_t, sl.item_id, v_loc, q) loop
      v_n := v_n + 1;
      perform mfg__move_so(v_doc, v_t, v_n, sl.item_id, v_loc, pk.batch_id, -pk.qty, v_unit, null, sl.id);
    end loop;
    amt := round(q * v_unit, 2);
    v_keys := jsonb_set(v_keys, array[v_key], to_jsonb(coalesce((v_keys->>v_key)::numeric, 0) + amt));
    v_cogs := v_cogs + amt;
  end loop;
  if v_n = 0 then raise exception 'Enter a quantity to deliver on at least one line.'; end if;

  if v_cogs <> 0 then
    v_lines := jsonb_build_array(jsonb_build_object('key', 'COGS', 'debit', v_cogs));
    for k in select jsonb_object_keys(v_keys) loop
      v_lines := v_lines || jsonb_build_object('key', k, 'credit', (v_keys->>k)::numeric);
    end loop;
    v_je := mfg__post_entry(v_t, v_date, 'Delivery ' || v_docno || ' (sales order ' || coalesce(so.document_number, '') || ')', 'mfg_material_documents', v_doc, v_lines);
    update mfg_material_documents set journal_entry_id = v_je where id = v_doc;
  end if;
  return v_doc;
end;
$$ language plpgsql security definer set search_path = public;

-- The customer invoice for what has been delivered and not yet invoiced. Its lines carry NO item, so the existing
-- post_invoice posts revenue, receivable and VAT and leaves stock and cost of goods sold to the delivery.
create or replace function mfg_create_invoice_from_so(p_so uuid, p_due date default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  so record; sl record; billable numeric; invoiced numeric; delivered numeric; v_sub numeric := 0; v_tax numeric; v_inv uuid; v_all boolean := true;
  v_rows jsonb := '[]'::jsonb; r jsonb;
begin
  select * into so from sales_orders where id = p_so and tenant_id = v_t;
  if so.id is null then raise exception 'That sales order was not found.'; end if;
  if so.status <> 'confirmed' then raise exception 'Only a confirmed sales order can be invoiced (this one is %).', so.status; end if;
  for sl in select * from sales_order_lines where sales_order_id = p_so order by id loop
    select coalesce(sum(il.qty), 0) into invoiced from mfg_invoice_links il join invoices i on i.id = il.invoice_id where il.so_line_id = sl.id and i.status <> 'void';
    if sl.item_id is null then delivered := sl.qty;
    else select coalesce(-sum(qty_change), 0) into delivered from mfg_material_doc_lines where so_line_id = sl.id; end if;
    billable := delivered - invoiced;
    if billable > 0.000001 then
      v_rows := v_rows || jsonb_build_object('so_line_id', sl.id, 'description', sl.description, 'qty', billable, 'unit_price', sl.unit_price);
      v_sub := v_sub + round(billable * sl.unit_price, 2);
    end if;
    if sl.qty - invoiced - greatest(billable, 0) > 0.000001 then v_all := false; end if;
  end loop;
  if jsonb_array_length(v_rows) = 0 then raise exception 'Nothing to invoice yet — deliver the goods first.'; end if;
  v_tax := round(v_sub * coalesce(so.tax_rate, 0) / 100, 2);
  insert into invoices (tenant_id, customer_id, order_date, due_date, total, tax_rate, tax_amount, status)
  values (v_t, so.customer_id, current_date, p_due, v_sub + v_tax, coalesce(so.tax_rate, 0), v_tax, 'draft') returning id into v_inv;
  for r in select * from jsonb_array_elements(v_rows) loop
    insert into invoice_lines (invoice_id, item_id, description, qty, unit_price)
    values (v_inv, null, r->>'description', (r->>'qty')::numeric, (r->>'unit_price')::numeric);
    insert into mfg_invoice_links (tenant_id, so_line_id, invoice_id, qty) values (v_t, (r->>'so_line_id')::uuid, v_inv, (r->>'qty')::numeric);
  end loop;
  if v_all then update sales_orders set status = 'invoiced' where id = p_so; end if;
  return v_inv;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg__avg_after(numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function mfg__move_so(uuid, uuid, int, uuid, uuid, uuid, numeric, numeric, uuid, uuid) from public, anon, authenticated;
revoke execute on function mfg__refresh_order_status(uuid) from public, anon, authenticated;
revoke execute on function mfg__reverse_entry(uuid, uuid, date, text, text, uuid) from public, anon, authenticated;
revoke execute on function mfg__reverse_doc(uuid, uuid, date, text) from public, anon, authenticated;
revoke execute on function mfg__variance_split(uuid) from public, anon, authenticated;
revoke execute on function mfg_reverse_document(uuid, date, text) from public, anon;
revoke execute on function mfg_reverse_confirmation(uuid, date, text) from public, anon;
revoke execute on function mfg_order_variances(uuid) from public, anon;
revoke execute on function mfg_settle_order(uuid, date) from public, anon;
revoke execute on function mfg_reverse_settlement(uuid, date, text) from public, anon;
revoke execute on function mfg_close_order(uuid) from public, anon;
revoke execute on function mfg_post_output_receipt(uuid, uuid, numeric, uuid, text, date, date, text) from public, anon;
revoke execute on function mfg_post_delivery(uuid, date, jsonb, text) from public, anon;
revoke execute on function mfg_create_invoice_from_so(uuid, date) from public, anon;
revoke execute on function mfg_create_order(uuid, numeric, date, date, int, int, boolean) from public, anon;
revoke execute on function mfg_post_confirmation(uuid, int, numeric, numeric, text, numeric, numeric, numeric, boolean, date, uuid, text) from public, anon;
revoke execute on function mfg_post_fg_receipt(uuid, numeric, uuid, text, date, date, text) from public, anon;
grant execute on function mfg_reverse_document(uuid, date, text) to authenticated;
grant execute on function mfg_reverse_confirmation(uuid, date, text) to authenticated;
grant execute on function mfg_order_variances(uuid) to authenticated;
grant execute on function mfg_settle_order(uuid, date) to authenticated;
grant execute on function mfg_reverse_settlement(uuid, date, text) to authenticated;
grant execute on function mfg_close_order(uuid) to authenticated;
grant execute on function mfg_post_output_receipt(uuid, uuid, numeric, uuid, text, date, date, text) to authenticated;
grant execute on function mfg_post_delivery(uuid, date, jsonb, text) to authenticated;
grant execute on function mfg_create_invoice_from_so(uuid, date) to authenticated;
grant execute on function mfg_create_order(uuid, numeric, date, date, int, int, boolean) to authenticated;
grant execute on function mfg_post_confirmation(uuid, int, numeric, numeric, text, numeric, numeric, numeric, boolean, date, uuid, text) to authenticated;
grant execute on function mfg_post_fg_receipt(uuid, numeric, uuid, text, date, date, text) to authenticated;
