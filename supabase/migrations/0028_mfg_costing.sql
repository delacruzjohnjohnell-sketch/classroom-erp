-- ============================================================
-- Classroom ERP — migration 0028 (Manufacturing ERP, Phase 3: costing engine)
--
-- ADDITIVE ONLY — no Standard object is touched. Needs 0023–0026.
-- Adds columns to three Manufacturing tables created in 0025, and replaces three Manufacturing functions
-- from 0025/0026 (mfg_save_item, mfg_save_routing, mfg_copy_routing) and mfg_seed_master_data, each with the
-- same signature plus the new fields.
--
-- New tables:  mfg_cost_estimates (CE-), mfg_cost_estimate_lines, mfg_cost_estimate_items
-- New columns: mfg_item_master  planned_price, price_unit, standard_cost, previous_standard_cost, future_cost,
--                               moving_avg_cost, cost_version, standard_cost_date
--              mfg_routing_ops  labor_min_per_unit, machine_min_per_unit
--              mfg_costing_sheet hour_basis
-- New functions: mfg_create_cost_estimate, mfg_mark_cost_estimate, mfg_release_cost_estimate, mfg_release_lines,
--   mfg_moving_average, and the internal roll-up helpers mfg__cost_item, mfg__cost_bom, mfg__cost_line, mfg__cost_warn.
--
-- How a cost is built (both for the screen and for the tests):
--   material   quantity needed (BOM line quantity × (1 + line scrap %), converted to the item's own unit)
--              × planned price ÷ price unit, for every bought part; made parts are costed from their own
--              bill of materials and routing, all the way down (a phantom is skipped over)
--   labor      labor hours × the planned rate of the work center for the costing date
--              (setup + teardown minutes are charged once per lot at the SETUP rate, or the labor rate if none)
--   machine    machine hours × the planned MACHINE rate
--   overhead   each active costing-sheet row: base × % + hours × rate per hour (variable → VAR_OH, fixed → FIX_OH)
--   yield      an item's own scrap % raises the quantity started: start = good ÷ (1 − scrap %)
--   co-/by-products take their cost-share % of the total; the main item carries the rest
--
-- ROLLBACK (drops only what this file created; restore the replaced functions from 0025/0026):
--   drop function if exists mfg_moving_average(numeric, numeric, numeric, numeric), mfg_release_cost_estimate(uuid, date),
--     mfg_mark_cost_estimate(uuid), mfg_release_lines(uuid), mfg_create_cost_estimate(uuid, numeric, date, int, int),
--     mfg__cost_item(uuid, uuid, uuid, numeric, date, int, int, int, uuid[]),
--     mfg__cost_bom(uuid, uuid, uuid, uuid, numeric, date, int, uuid[]),
--     mfg__cost_line(uuid, uuid, int, uuid, uuid, uuid, int, text, text, numeric, text, numeric, numeric), mfg__cost_warn(uuid, text);
--   drop table if exists mfg_cost_estimate_items, mfg_cost_estimate_lines, mfg_cost_estimates;
--   alter table mfg_item_master drop column planned_price, drop column price_unit, drop column standard_cost,
--     drop column previous_standard_cost, drop column future_cost, drop column moving_avg_cost,
--     drop column cost_version, drop column standard_cost_date;
--   alter table mfg_routing_ops drop column labor_min_per_unit, drop column machine_min_per_unit;
--   alter table mfg_costing_sheet drop column hour_basis;
-- ============================================================

-- ---------- new columns on Manufacturing tables ----------
alter table mfg_item_master
  add column if not exists planned_price          numeric(18, 6) not null default 0 check (planned_price >= 0),   -- per "price unit" base units
  add column if not exists price_unit             int            not null default 1 check (price_unit >= 1),
  add column if not exists standard_cost          numeric(18, 6) not null default 0,                              -- per 1 base unit; set only by a released estimate
  add column if not exists previous_standard_cost numeric(18, 6) not null default 0,
  add column if not exists future_cost            numeric(18, 6),                                                 -- set when an estimate is marked
  add column if not exists moving_avg_cost        numeric(18, 6) not null default 0,                              -- actual costing (Phase 4)
  add column if not exists cost_version           int            not null default 0,
  add column if not exists standard_cost_date     date;

alter table mfg_routing_ops
  add column if not exists labor_min_per_unit   numeric(12, 4) check (labor_min_per_unit is null or labor_min_per_unit >= 0),
  add column if not exists machine_min_per_unit numeric(12, 4) check (machine_min_per_unit is null or machine_min_per_unit >= 0);
-- Both blank = the run time is all labor (so routings saved before this migration still cost).

alter table mfg_costing_sheet
  add column if not exists hour_basis text not null default 'MACHINE' check (hour_basis in ('LABOR', 'MACHINE'));
update mfg_costing_sheet set hour_basis = 'LABOR' where kind = 'FIXED' and name = 'Fixed overhead';

-- ---------- estimate tables ----------
create table if not exists mfg_cost_estimates (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  document_number text,                                           -- CE-0001
  item_id         uuid not null references items(id),
  lot_size        numeric(18, 4) not null check (lot_size > 0),
  costing_date    date not null,
  bom_alt         int not null default 1,
  routing_alt     int not null default 1,
  costing_method  text not null check (costing_method in ('STANDARD', 'ACTUAL')),
  status          text not null default 'DRAFT' check (status in ('DRAFT', 'MARKED', 'RELEASED', 'SUPERSEDED')),
  total_cost      numeric(18, 6) not null default 0,              -- everything it takes to make the lot
  main_share_pct  numeric(7, 3) not null default 100,             -- the rest goes to co-/by-products
  unit_cost       numeric(18, 6) not null default 0,              -- of the main item
  warnings        jsonb not null default '[]'::jsonb,
  release_entry_id uuid references journal_entries(id) on delete set null,
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  marked_at       timestamptz,
  released_at     timestamptz,
  released_by     uuid
);
create index if not exists mfg_cost_estimates_idx on mfg_cost_estimates (tenant_id, item_id, status);

create table if not exists mfg_cost_estimate_lines (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  estimate_id       uuid not null references mfg_cost_estimates(id) on delete cascade,
  seq               int not null,
  level             int not null,
  item_id           uuid references items(id),                    -- the item being made at this level
  component_item_id uuid references items(id),
  work_center_id    uuid references mfg_work_centers(id),
  op_no             int,
  element           text not null check (element in ('MATERIAL', 'LABOR', 'MACHINE', 'VAR_OH', 'FIX_OH')),
  description       text,
  qty               numeric(18, 6),
  uom               text,
  rate              numeric(18, 6),
  amount            numeric(18, 6) not null
);
create index if not exists mfg_cost_estimate_lines_idx on mfg_cost_estimate_lines (estimate_id, seq);

create table if not exists mfg_cost_estimate_items (
  estimate_id uuid not null references mfg_cost_estimates(id) on delete cascade,
  tenant_id   uuid not null references tenants(id) on delete cascade,
  item_id     uuid not null references items(id),
  level       int not null,
  qty         numeric(18, 6) not null,                            -- quantity of this item the estimate makes
  total_cost  numeric(18, 6) not null,                            -- including its own sub-assemblies
  unit_cost   numeric(18, 6) not null,
  primary key (estimate_id, item_id)
);

alter table mfg_cost_estimates enable row level security;
alter table mfg_cost_estimate_lines enable row level security;
alter table mfg_cost_estimate_items enable row level security;
drop policy if exists "mfg read" on mfg_cost_estimates;
drop policy if exists "mfg read" on mfg_cost_estimate_lines;
drop policy if exists "mfg read" on mfg_cost_estimate_items;
create policy "mfg read" on mfg_cost_estimates for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING');
create policy "mfg read" on mfg_cost_estimate_lines for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING');
create policy "mfg read" on mfg_cost_estimate_items for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING');
-- no insert / update / delete policy: only the functions below write these tables

drop trigger if exists trg_mfg_estimate_number on mfg_cost_estimates;
create trigger trg_mfg_estimate_number before insert on mfg_cost_estimates
  for each row execute function mfg_assign_number('cost_estimate', 'CE');

-- ---------- replaced Manufacturing functions (same signature, new fields) ----------
create or replace function mfg_seed_master_data(tid uuid)
returns void as $$
begin
  insert into mfg_uom (tenant_id, code, name) values
    (tid, 'PC', 'Piece'), (tid, 'SET', 'Set'), (tid, 'BOX', 'Box'), (tid, 'PACK', 'Pack'), (tid, 'DOZ', 'Dozen'),
    (tid, 'KG', 'Kilogram'), (tid, 'G', 'Gram'), (tid, 'L', 'Liter'), (tid, 'ML', 'Milliliter'),
    (tid, 'M', 'Meter'), (tid, 'CM', 'Centimeter'), (tid, 'BF', 'Board foot'), (tid, 'SQM', 'Square meter'), (tid, 'HR', 'Hour')
  on conflict do nothing;
  insert into mfg_storage_locations (tenant_id, code, name, kind) values
    (tid, 'RM-STORE', 'Raw Material Store', 'RM'), (tid, 'SHOP-FLOOR', 'Shop Floor (WIP)', 'WIP'),
    (tid, 'FG-STORE', 'Finished Goods Store', 'FG'), (tid, 'QUARANTINE', 'Quarantine', 'QUARANTINE')
  on conflict do nothing;
  insert into mfg_activity_types (tenant_id, code, name, kind) values
    (tid, 'LABOR', 'Direct labor', 'LABOR'), (tid, 'MACHINE', 'Machine time', 'MACHINE'), (tid, 'SETUP', 'Setup', 'SETUP')
  on conflict do nothing;
  insert into mfg_cost_centers (tenant_id, code, name) values (tid, 'PROD', 'Production') on conflict do nothing;
  insert into mfg_costing_sheet (tenant_id, name, kind, base, oh_pct, oh_rate_per_hour, hour_basis) values
    (tid, 'Variable overhead', 'VARIABLE', 'MATERIAL', 0, 0, 'MACHINE'),
    (tid, 'Fixed overhead', 'FIXED', 'LABOR', 0, 0, 'LABOR')
  on conflict do nothing;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_save_item(p_item_id uuid, p_data jsonb)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_name text := trim(coalesce(p_data->>'name', ''));
  v_sku text := trim(coalesce(p_data->>'sku', ''));
  v_uom text := coalesce(p_data->>'base_uom', '');
  v_type text := coalesce(p_data->>'item_type', '');
  v_mob text := coalesce(p_data->>'make_or_buy', '');
  v_rule text := coalesce(nullif(p_data->>'lot_rule', ''), 'LOT_FOR_LOT');
  v_lot numeric := coalesce(nullif(p_data->>'lot_size', '')::numeric, 0);
  v_min numeric := coalesce(nullif(p_data->>'min_lot', '')::numeric, 0);
  v_max numeric := coalesce(nullif(p_data->>'max_lot', '')::numeric, 0);
  v_price numeric := coalesce(nullif(p_data->>'planned_price', '')::numeric, 0);
  v_punit int := coalesce(nullif(p_data->>'price_unit', '')::int, 1);
  v_loc uuid := nullif(p_data->>'default_location_id', '')::uuid;
  v_id uuid;
begin
  if v_name = '' then raise exception 'Give the item a name.'; end if;
  if v_sku = '' then raise exception 'Give the item a SKU or code.'; end if;
  if v_type not in ('RAW', 'SEMI', 'FINISHED', 'PACKAGING', 'SERVICE') then raise exception 'Choose an item type.'; end if;
  if v_mob not in ('MAKE', 'BUY') then raise exception 'Choose whether the item is made or bought.'; end if;
  if not exists (select 1 from mfg_uom where tenant_id = v_t and code = v_uom) then raise exception 'Choose a unit of measure.'; end if;
  if v_rule = 'FIXED' and v_lot <= 0 then raise exception 'A fixed lot size needs a lot size above zero.'; end if;
  if v_rule = 'MIN_MAX' and v_max < v_min then raise exception 'The maximum lot size can''t be below the minimum.'; end if;
  if v_price < 0 then raise exception 'The planned price can''t be negative.'; end if;
  if v_punit < 1 then raise exception 'The price unit must be 1 or more (for example 100 for "per 100 pieces").'; end if;
  if v_loc is not null and not exists (select 1 from mfg_storage_locations where id = v_loc and tenant_id = v_t) then
    raise exception 'That storage location isn''t in your company.';
  end if;

  if p_item_id is null then
    if exists (select 1 from items where tenant_id = v_t and lower(sku) = lower(v_sku)) then raise exception 'An item with the SKU "%" already exists.', v_sku; end if;
    if exists (select 1 from items where tenant_id = v_t and lower(name) = lower(v_name)) then raise exception 'An item named "%" already exists.', v_name; end if;
    insert into items (tenant_id, sku, name, qty_on_hand, unit_cost, reorder_point)
    values (v_t, v_sku, v_name, 0, 0, coalesce(nullif(p_data->>'reorder_point', '')::numeric, 0)) returning id into v_id;
    insert into mfg_item_master (item_id, tenant_id, item_type, make_or_buy, base_uom, procurement_lead_days, production_lead_days,
      lot_rule, lot_size, min_lot, max_lot, safety_stock, scrap_pct, batch_tracked, default_location_id, planned_price, price_unit)
    values (v_id, v_t, v_type, v_mob, v_uom,
      coalesce(nullif(p_data->>'procurement_lead_days', '')::int, 0), coalesce(nullif(p_data->>'production_lead_days', '')::int, 0),
      v_rule, v_lot, v_min, v_max, coalesce(nullif(p_data->>'safety_stock', '')::numeric, 0),
      coalesce(nullif(p_data->>'scrap_pct', '')::numeric, 0), coalesce((p_data->>'batch_tracked')::boolean, false), v_loc, v_price, v_punit);
  else
    if not exists (select 1 from mfg_item_master where item_id = p_item_id and tenant_id = v_t) then raise exception 'That item was not found.'; end if;
    if exists (select 1 from items where tenant_id = v_t and lower(sku) = lower(v_sku) and id <> p_item_id) then raise exception 'An item with the SKU "%" already exists.', v_sku; end if;
    if exists (select 1 from items where tenant_id = v_t and lower(name) = lower(v_name) and id <> p_item_id) then raise exception 'An item named "%" already exists.', v_name; end if;
    v_id := p_item_id;
    update items set sku = v_sku, name = v_name, reorder_point = coalesce(nullif(p_data->>'reorder_point', '')::numeric, reorder_point) where id = v_id;
    update mfg_item_master set item_type = v_type, make_or_buy = v_mob, base_uom = v_uom,
      procurement_lead_days = coalesce(nullif(p_data->>'procurement_lead_days', '')::int, 0),
      production_lead_days = coalesce(nullif(p_data->>'production_lead_days', '')::int, 0),
      lot_rule = v_rule, lot_size = v_lot, min_lot = v_min, max_lot = v_max,
      safety_stock = coalesce(nullif(p_data->>'safety_stock', '')::numeric, 0),
      scrap_pct = coalesce(nullif(p_data->>'scrap_pct', '')::numeric, 0),
      batch_tracked = coalesce((p_data->>'batch_tracked')::boolean, false),
      default_location_id = v_loc,
      planned_price = v_price, price_unit = v_punit,
      active = coalesce((p_data->>'active')::boolean, active)
    where item_id = v_id;
  end if;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_save_routing(p_routing_id uuid, p_data jsonb)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_item uuid; v_alt int; v_desc text; v_id uuid; v_ver int; v_status text;
  v_op jsonb; v_n int := 0; v_opno int; v_wc uuid; v_wc_active boolean; v_key text; v_seen int[] := '{}';
begin
  if jsonb_typeof(p_data->'ops') is distinct from 'array' or jsonb_array_length(p_data->'ops') = 0 then
    raise exception 'Add at least one operation to the routing.';
  end if;
  if p_routing_id is null then
    v_item := nullif(p_data->>'item_id', '')::uuid;
    v_alt := coalesce(nullif(p_data->>'alt_no', '')::int, 1);
  else
    select item_id, alt_no, status into v_item, v_alt, v_status from mfg_routings where id = p_routing_id and tenant_id = v_t;
    if v_item is null then raise exception 'That routing was not found.'; end if;
    if v_status <> 'DRAFT' then raise exception 'Only a draft can be edited. Copy this one to a new version first.'; end if;
  end if;
  if v_alt < 1 then raise exception 'The alternative number must be 1 or higher.'; end if;
  if not exists (select 1 from mfg_item_master where item_id = v_item and tenant_id = v_t and make_or_buy = 'MAKE') then
    raise exception 'Choose an item you make. Only items marked "Make" can have a routing.';
  end if;
  v_desc := nullif(trim(coalesce(p_data->>'description', '')), '');

  if p_routing_id is null then
    select coalesce(max(version), 0) + 1 into v_ver from mfg_routings where tenant_id = v_t and item_id = v_item and alt_no = v_alt;
    insert into mfg_routings (tenant_id, item_id, version, alt_no, description) values (v_t, v_item, v_ver, v_alt, v_desc) returning id into v_id;
  else
    v_id := p_routing_id;
    update mfg_routings set description = v_desc where id = v_id;
    delete from mfg_routing_ops where routing_id = v_id;
  end if;

  for v_op in select * from jsonb_array_elements(p_data->'ops') loop
    v_n := v_n + 1;
    v_opno := coalesce(nullif(v_op->>'op_no', '')::int, v_n * 10);
    v_wc := nullif(v_op->>'work_center_id', '')::uuid;
    v_key := coalesce(nullif(v_op->>'control_key', ''), 'PP01');
    if v_opno <= 0 then raise exception 'Operation %: the operation number must be above zero.', v_n; end if;
    if v_opno = any (v_seen) then raise exception 'Operation number % is used twice.', v_opno; end if;
    v_seen := v_seen || v_opno;
    select active into v_wc_active from mfg_work_centers where id = v_wc and tenant_id = v_t;
    if v_wc_active is null then raise exception 'Operation %: choose a work center.', v_opno; end if;
    if not v_wc_active then raise exception 'Operation %: that work center is inactive.', v_opno; end if;
    if v_key not in ('PP01', 'PP02', 'PP03') then raise exception 'Operation %: choose a control key.', v_opno; end if;
    insert into mfg_routing_ops (tenant_id, routing_id, op_no, description, work_center_id, setup_min, run_min_per_unit,
                                 teardown_min, queue_min, move_min, control_key, component_line_nos, labor_min_per_unit, machine_min_per_unit)
    values (v_t, v_id, v_opno, nullif(trim(coalesce(v_op->>'description', '')), ''), v_wc,
            coalesce(nullif(v_op->>'setup_min', '')::numeric, 0), coalesce(nullif(v_op->>'run_min_per_unit', '')::numeric, 0),
            coalesce(nullif(v_op->>'teardown_min', '')::numeric, 0), coalesce(nullif(v_op->>'queue_min', '')::numeric, 0),
            coalesce(nullif(v_op->>'move_min', '')::numeric, 0), v_key,
            coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(v_op->'component_line_nos', '[]'::jsonb)) x), '{}'),
            nullif(v_op->>'labor_min_per_unit', '')::numeric, nullif(v_op->>'machine_min_per_unit', '')::numeric);
  end loop;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_copy_routing(p_routing_id uuid)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  r mfg_routings;
  v_id uuid;
begin
  select * into r from mfg_routings where id = p_routing_id and tenant_id = v_t;
  if r.id is null then raise exception 'That routing was not found.'; end if;
  insert into mfg_routings (tenant_id, item_id, version, alt_no, description)
  values (v_t, r.item_id, (select max(version) + 1 from mfg_routings where tenant_id = v_t and item_id = r.item_id and alt_no = r.alt_no),
          r.alt_no, r.description) returning id into v_id;
  insert into mfg_routing_ops (tenant_id, routing_id, op_no, description, work_center_id, setup_min, run_min_per_unit,
                               teardown_min, queue_min, move_min, control_key, component_line_nos, labor_min_per_unit, machine_min_per_unit)
  select tenant_id, v_id, op_no, description, work_center_id, setup_min, run_min_per_unit,
         teardown_min, queue_min, move_min, control_key, component_line_nos, labor_min_per_unit, machine_min_per_unit
    from mfg_routing_ops where routing_id = p_routing_id;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the roll-up ----------
create or replace function mfg__cost_warn(p_est uuid, p_msg text)
returns void as $$
  update mfg_cost_estimates
     set warnings = case when warnings @> to_jsonb(p_msg) then warnings else warnings || to_jsonb(p_msg) end
   where id = p_est;
$$ language sql security definer set search_path = public;

create or replace function mfg__cost_line(
  p_est uuid, p_tenant uuid, p_level int, p_item uuid, p_comp uuid, p_wc uuid, p_op int,
  p_element text, p_desc text, p_qty numeric, p_uom text, p_rate numeric, p_amount numeric)
returns void as $$
  insert into mfg_cost_estimate_lines (tenant_id, estimate_id, seq, level, item_id, component_item_id, work_center_id, op_no, element, description, qty, uom, rate, amount)
  values (p_tenant, p_est, coalesce((select max(seq) from mfg_cost_estimate_lines where estimate_id = p_est), 0) + 1,
          p_level, p_item, p_comp, p_wc, p_op, p_element, p_desc, p_qty, p_uom, p_rate, p_amount);
$$ language sql security definer set search_path = public;

-- Costs the components of one bill of materials. Bought parts become MATERIAL lines; made parts are costed
-- recursively (their own lines sit one level down); a phantom is looked straight through.
create or replace function mfg__cost_bom(
  p_est uuid, p_tenant uuid, p_owner uuid, p_bom uuid, p_qty numeric, p_date date, p_level int, p_ancestors uuid[],
  out o_mat numeric, out o_sub numeric)
as $$
declare
  v_base numeric;
  l record;
  r record;
  v_need numeric;
  v_comp_bom uuid;
  v_price numeric;
  v_amount numeric;
begin
  o_mat := 0; o_sub := 0;
  select base_qty into v_base from mfg_boms where id = p_bom;
  for l in select bi.*, m.base_uom as comp_uom, m.make_or_buy, m.planned_price, m.price_unit, i.name as comp_name
             from mfg_bom_items bi
             join mfg_item_master m on m.item_id = bi.component_item_id
             join items i on i.id = bi.component_item_id
            where bi.bom_id = p_bom and bi.kind = 'COMPONENT' order by bi.line_no loop
    if l.component_item_id = any (p_ancestors) then
      raise exception 'This structure loops back on itself at "%".', l.comp_name;
    end if;
    v_need := round(mfg_convert_qty(p_tenant, l.component_item_id, p_qty / v_base * l.qty * (1 + l.scrap_pct / 100), l.uom, l.comp_uom), 6);
    v_comp_bom := mfg_active_bom(p_tenant, l.component_item_id, p_date, 1);

    if l.is_phantom then
      if v_comp_bom is null then
        perform mfg__cost_warn(p_est, 'The phantom "' || l.comp_name || '" has no active bill of materials, so its parts are not costed.');
      else
        select * into r from mfg__cost_bom(p_est, p_tenant, p_owner, v_comp_bom, v_need, p_date, p_level, p_ancestors || l.component_item_id);
        o_mat := o_mat + r.o_mat; o_sub := o_sub + r.o_sub;
      end if;
    elsif l.make_or_buy = 'MAKE' and v_comp_bom is not null then
      o_sub := o_sub + mfg__cost_item(p_est, p_tenant, l.component_item_id, v_need, p_date, p_level + 1, 1, 1, p_ancestors || l.component_item_id);
    else
      if l.make_or_buy = 'MAKE' then
        perform mfg__cost_warn(p_est, '"' || l.comp_name || '" is made in-house but has no active bill of materials on this date, so it is costed at its planned price.');
      end if;
      if l.planned_price = 0 then
        perform mfg__cost_warn(p_est, '"' || l.comp_name || '" has no planned price, so it costs nothing in this estimate.');
      end if;
      v_price := l.planned_price / l.price_unit;
      v_amount := round(v_need * v_price, 6);
      perform mfg__cost_line(p_est, p_tenant, p_level, p_owner, l.component_item_id, null, null, 'MATERIAL', l.comp_name, v_need, l.comp_uom, v_price, v_amount);
      o_mat := o_mat + v_amount;
    end if;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- Costs producing p_qty good units of one item. Returns the total cost of the lot, sub-assemblies included.
create or replace function mfg__cost_item(
  p_est uuid, p_tenant uuid, p_item uuid, p_qty numeric, p_date date, p_level int, p_bom_alt int, p_rt_alt int, p_ancestors uuid[])
returns numeric as $$
declare
  v_name text;
  v_bom uuid;
  v_rt uuid;
  v_scrap numeric;
  v_start numeric;
  r record;
  op record;
  cs record;
  v_mat numeric; v_sub numeric;
  v_lab numeric := 0; v_mach numeric := 0; v_oh numeric := 0;
  v_lab_h numeric := 0; v_mach_h numeric := 0; v_setup_h numeric := 0;
  at_labor uuid; at_machine uuid; at_setup uuid;
  rate_l numeric; rate_m numeric; rate_s numeric;
  h numeric; amt numeric; base_amt numeric; hrs numeric;
  v_total numeric;
begin
  select i.name, m.scrap_pct into v_name, v_scrap from items i join mfg_item_master m on m.item_id = i.id where i.id = p_item;
  v_bom := mfg_active_bom(p_tenant, p_item, p_date, p_bom_alt);
  if v_bom is null then
    raise exception 'There is no active bill of materials for "%" on %.', v_name, to_char(p_date, 'Mon DD, YYYY');
  end if;
  v_start := round(p_qty / (1 - v_scrap / 100), 6);

  select * into r from mfg__cost_bom(p_est, p_tenant, p_item, v_bom, v_start, p_date, p_level, p_ancestors);
  v_mat := r.o_mat; v_sub := r.o_sub;

  select id into at_labor from mfg_activity_types where tenant_id = p_tenant and kind = 'LABOR' order by code limit 1;
  select id into at_machine from mfg_activity_types where tenant_id = p_tenant and kind = 'MACHINE' order by code limit 1;
  select id into at_setup from mfg_activity_types where tenant_id = p_tenant and kind = 'SETUP' order by code limit 1;

  select id into v_rt from mfg_routings where tenant_id = p_tenant and item_id = p_item and alt_no = p_rt_alt and status = 'ACTIVE';
  if v_rt is null then
    perform mfg__cost_warn(p_est, '"' || v_name || '" has no active routing, so no labor or machine cost is included for it.');
  else
    for op in select o.*, w.name as wc_name from mfg_routing_ops o join mfg_work_centers w on w.id = o.work_center_id
               where o.routing_id = v_rt order by o.op_no loop
      h := coalesce(op.labor_min_per_unit, case when op.machine_min_per_unit is null then op.run_min_per_unit else 0 end) * v_start / 60;
      hrs := coalesce(op.machine_min_per_unit, 0) * v_start / 60;
      rate_l := mfg_activity_rate(op.work_center_id, at_labor, p_date);
      rate_m := mfg_activity_rate(op.work_center_id, at_machine, p_date);
      rate_s := coalesce(mfg_activity_rate(op.work_center_id, at_setup, p_date), rate_l);

      if h > 0 then
        if rate_l is null then perform mfg__cost_warn(p_est, 'Work center "' || op.wc_name || '" has no planned labor rate for ' || to_char(p_date, 'Mon YYYY') || '.'); end if;
        amt := round(h * coalesce(rate_l, 0), 6);
        perform mfg__cost_line(p_est, p_tenant, p_level, p_item, null, op.work_center_id, op.op_no, 'LABOR',
          'Op ' || op.op_no || ' ' || coalesce(op.description, op.wc_name) || ' — labor', h, 'HR', coalesce(rate_l, 0), amt);
        v_lab := v_lab + amt; v_lab_h := v_lab_h + h;
      end if;
      if (op.setup_min + op.teardown_min) > 0 then
        if rate_s is null then perform mfg__cost_warn(p_est, 'Work center "' || op.wc_name || '" has no planned setup or labor rate for ' || to_char(p_date, 'Mon YYYY') || '.'); end if;
        h := (op.setup_min + op.teardown_min) / 60;      -- once per lot, however many units
        amt := round(h * coalesce(rate_s, 0), 6);
        perform mfg__cost_line(p_est, p_tenant, p_level, p_item, null, op.work_center_id, op.op_no, 'LABOR',
          'Op ' || op.op_no || ' ' || coalesce(op.description, op.wc_name) || ' — setup and teardown', h, 'HR', coalesce(rate_s, 0), amt);
        v_lab := v_lab + amt; v_setup_h := v_setup_h + h;
      end if;
      if hrs > 0 then
        if rate_m is null then perform mfg__cost_warn(p_est, 'Work center "' || op.wc_name || '" has no planned machine rate for ' || to_char(p_date, 'Mon YYYY') || '.'); end if;
        amt := round(hrs * coalesce(rate_m, 0), 6);
        perform mfg__cost_line(p_est, p_tenant, p_level, p_item, null, op.work_center_id, op.op_no, 'MACHINE',
          'Op ' || op.op_no || ' ' || coalesce(op.description, op.wc_name) || ' — machine', hrs, 'HR', coalesce(rate_m, 0), amt);
        v_mach := v_mach + amt; v_mach_h := v_mach_h + hrs;
      end if;
    end loop;
  end if;

  for cs in select * from mfg_costing_sheet where tenant_id = p_tenant and active order by kind, name loop
    base_amt := case cs.base when 'MATERIAL' then v_mat when 'LABOR' then v_lab else v_mat + v_lab end;
    hrs := case cs.hour_basis when 'LABOR' then v_lab_h + v_setup_h else v_mach_h end;
    amt := round(base_amt * cs.oh_pct / 100 + hrs * cs.oh_rate_per_hour, 6);
    if amt <> 0 then
      perform mfg__cost_line(p_est, p_tenant, p_level, p_item, null, null, null, case cs.kind when 'FIXED' then 'FIX_OH' else 'VAR_OH' end,
        cs.name, case when cs.oh_rate_per_hour <> 0 then hrs else base_amt end, case when cs.oh_rate_per_hour <> 0 then 'HR' else null end,
        case when cs.oh_rate_per_hour <> 0 then cs.oh_rate_per_hour else cs.oh_pct end, amt);
      v_oh := v_oh + amt;
    end if;
  end loop;

  v_total := v_mat + v_sub + v_lab + v_mach + v_oh;
  insert into mfg_cost_estimate_items (estimate_id, tenant_id, item_id, level, qty, total_cost, unit_cost)
  values (p_est, p_tenant, p_item, p_level, p_qty, v_total, round(v_total / p_qty, 6))
  on conflict (estimate_id, item_id) do update
    set qty = mfg_cost_estimate_items.qty + excluded.qty,
        total_cost = mfg_cost_estimate_items.total_cost + excluded.total_cost,
        unit_cost = round((mfg_cost_estimate_items.total_cost + excluded.total_cost) / (mfg_cost_estimate_items.qty + excluded.qty), 6),
        level = greatest(mfg_cost_estimate_items.level, excluded.level);
  return v_total;
end;
$$ language plpgsql security definer set search_path = public;

-- Creates and works out a cost estimate for a lot of one item.
create or replace function mfg_create_cost_estimate(
  p_item uuid, p_lot_size numeric, p_date date default current_date, p_bom_alt int default 1, p_routing_alt int default 1)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text;
  v_est uuid;
  v_total numeric;
  v_share numeric := 0;
  v_unit numeric;
  v_name text;
  v_bom uuid;
  b record;
  v_qty_out numeric;
begin
  if p_lot_size is null or p_lot_size <= 0 then raise exception 'Enter a lot size above zero.'; end if;
  select i.name into v_name from items i join mfg_item_master m on m.item_id = i.id
   where i.id = p_item and i.tenant_id = v_t and m.make_or_buy = 'MAKE';
  if v_name is null then raise exception 'Choose an item you make. Only items marked "Make" can be costed.'; end if;
  select costing_method into v_method from mfg_company_settings where tenant_id = v_t;
  v_bom := mfg_active_bom(v_t, p_item, p_date, p_bom_alt);
  if v_bom is null then
    raise exception 'There is no active bill of materials for "%" on %. Activate one first.', v_name, to_char(p_date, 'Mon DD, YYYY');
  end if;

  insert into mfg_cost_estimates (tenant_id, item_id, lot_size, costing_date, bom_alt, routing_alt, costing_method)
  values (v_t, p_item, p_lot_size, p_date, p_bom_alt, p_routing_alt, v_method) returning id into v_est;

  v_total := mfg__cost_item(v_est, v_t, p_item, p_lot_size, p_date, 0, p_bom_alt, p_routing_alt, array[p_item]);

  select coalesce(sum(cost_share_pct), 0) into v_share from mfg_bom_items where bom_id = v_bom and kind <> 'COMPONENT';
  v_unit := round(v_total * (100 - v_share) / 100 / p_lot_size, 6);
  update mfg_cost_estimates set total_cost = round(v_total, 6), main_share_pct = 100 - v_share, unit_cost = v_unit where id = v_est;
  update mfg_cost_estimate_items set unit_cost = v_unit where estimate_id = v_est and item_id = p_item;

  -- co-products and by-products take their share of the lot's cost
  for b in select bi.*, m.base_uom as out_uom from mfg_bom_items bi join mfg_item_master m on m.item_id = bi.component_item_id
            where bi.bom_id = v_bom and bi.kind <> 'COMPONENT' and bi.cost_share_pct > 0 loop
    v_qty_out := round(mfg_convert_qty(v_t, b.component_item_id,
      p_lot_size / (select base_qty from mfg_boms where id = v_bom) * b.qty, b.uom, b.out_uom), 6);
    insert into mfg_cost_estimate_items (estimate_id, tenant_id, item_id, level, qty, total_cost, unit_cost)
    values (v_est, v_t, b.component_item_id, 0, v_qty_out, round(v_total * b.cost_share_pct / 100, 6),
            round(v_total * b.cost_share_pct / 100 / v_qty_out, 6))
    on conflict (estimate_id, item_id) do nothing;
  end loop;
  return v_est;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- what releasing an estimate changes (shared by the preview and the release) ----------
create or replace function mfg_release_lines(p_est uuid)
returns table (item_id uuid, item_name text, item_type text, old_cost numeric, new_cost numeric, qty_on_hand numeric,
               value_change numeric, account_key text) as $$
  with wanted as (
    select distinct on (w.item_id) w.item_id, w.new_cost from (
      select ei.item_id, ei.unit_cost as new_cost, 1 as prio from mfg_cost_estimate_items ei where ei.estimate_id = p_est
      union all
      select l.component_item_id, round(l.rate, 6), 2 from mfg_cost_estimate_lines l
       where l.estimate_id = p_est and l.element = 'MATERIAL' and l.component_item_id is not null
    ) w order by w.item_id, w.prio
  )
  select m.item_id, i.name, m.item_type, m.standard_cost, w.new_cost, i.qty_on_hand,
         round(i.qty_on_hand * (w.new_cost - m.standard_cost), 2),
         case m.item_type when 'RAW' then 'RM_INVENTORY' when 'PACKAGING' then 'PACKAGING_INVENTORY'
                          when 'SEMI' then 'FG_INVENTORY' when 'FINISHED' then 'FG_INVENTORY' else null end
    from wanted w join mfg_item_master m on m.item_id = w.item_id join items i on i.id = m.item_id
   order by i.name;
$$ language sql stable set search_path = public;

create or replace function mfg_mark_cost_estimate(p_est uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  e mfg_cost_estimates;
begin
  select * into e from mfg_cost_estimates where id = p_est and tenant_id = v_t;
  if e.id is null then raise exception 'That cost estimate was not found.'; end if;
  if e.status <> 'DRAFT' then raise exception 'Only a draft estimate can be marked (this one is %).', lower(e.status); end if;
  if e.costing_method <> 'STANDARD' then
    raise exception 'Your company uses actual costing, so estimates are for planning only and set no standard cost.';
  end if;
  if jsonb_array_length(e.warnings) > 0 then
    raise exception 'Fix the warnings on this estimate first (for example a missing price, rate or routing), then make a new estimate.';
  end if;
  -- a newer marked estimate replaces an older one for the same item
  update mfg_cost_estimates set status = 'SUPERSEDED' where tenant_id = v_t and item_id = e.item_id and status = 'MARKED' and id <> p_est;
  update mfg_item_master m set future_cost = r.new_cost from mfg_release_lines(p_est) r where m.item_id = r.item_id;
  update mfg_cost_estimates set status = 'MARKED', marked_at = now() where id = p_est;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_release_cost_estimate(p_est uuid, p_date date default current_date)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  e mfg_cost_estimates;
  g record;
  v_rows jsonb;
  v_row jsonb;
  v_je uuid;
  v_net numeric := 0;
begin
  select * into e from mfg_cost_estimates where id = p_est and tenant_id = v_t;
  if e.id is null then raise exception 'That cost estimate was not found.'; end if;
  if e.status <> 'MARKED' then raise exception 'Only a marked estimate can be released (this one is %).', lower(e.status); end if;
  if p_date is null then raise exception 'Choose the date the new standard costs start.'; end if;

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_rows from mfg_release_lines(p_est) l;   -- fixed before anything changes

  -- one revaluation entry for the stock already on hand
  if exists (select 1 from jsonb_array_elements(v_rows) x where (x->>'value_change')::numeric <> 0 and x->>'account_key' is not null) then
    insert into journal_entries (tenant_id, entry_date, memo, created_by, source_table, source_id)
    values (v_t, p_date, 'Standard cost release ' || e.document_number || ' — revaluation of stock on hand', auth.uid(), 'mfg_cost_estimates', p_est)
    returning id into v_je;
    for g in select x->>'account_key' as account_key, sum((x->>'value_change')::numeric) as amount
               from jsonb_array_elements(v_rows) x
              where (x->>'value_change')::numeric <> 0 and x->>'account_key' is not null
              group by x->>'account_key' order by 1 loop
      if g.amount <> 0 then
        insert into journal_lines (journal_entry_id, account_id, debit, credit)
        values (v_je, mfg_account(v_t, g.account_key), greatest(g.amount, 0), greatest(-g.amount, 0));
        v_net := v_net + g.amount;
      end if;
    end loop;
    if v_net <> 0 then
      insert into journal_lines (journal_entry_id, account_id, debit, credit)
      values (v_je, mfg_account(v_t, 'REVALUATION'), greatest(-v_net, 0), greatest(v_net, 0));
    end if;
  end if;

  for v_row in select * from jsonb_array_elements(v_rows) loop
    update mfg_item_master set previous_standard_cost = standard_cost, standard_cost = (v_row->>'new_cost')::numeric, future_cost = null,
           cost_version = cost_version + 1, standard_cost_date = p_date
     where item_id = (v_row->>'item_id')::uuid;
    update items set unit_cost = (v_row->>'new_cost')::numeric where id = (v_row->>'item_id')::uuid;   -- the Standard-side mirror of the cost
  end loop;

  update mfg_cost_estimates set status = 'SUPERSEDED' where tenant_id = v_t and item_id = e.item_id and status = 'RELEASED' and id <> p_est;
  update mfg_cost_estimates set status = 'RELEASED', released_at = now(), released_by = auth.uid(), release_entry_id = v_je where id = p_est;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'cost_estimate_released', jsonb_build_object('estimate', e.document_number, 'item_id', e.item_id, 'unit_cost', e.unit_cost, 'date', p_date), auth.uid());
  return v_je;
end;
$$ language plpgsql security definer set search_path = public;

-- Moving average cost after receiving in_qty at in_cost on top of old_qty at old_cost (actual costing, Phase 4).
create or replace function mfg_moving_average(old_qty numeric, old_cost numeric, in_qty numeric, in_cost numeric)
returns numeric as $$
  select case when greatest(coalesce(old_qty, 0), 0) + coalesce(in_qty, 0) <= 0 then coalesce(in_cost, 0)
              else round((greatest(coalesce(old_qty, 0), 0) * coalesce(old_cost, 0) + coalesce(in_qty, 0) * coalesce(in_cost, 0))
                         / (greatest(coalesce(old_qty, 0), 0) + coalesce(in_qty, 0)), 6) end;
$$ language sql immutable;

-- ---------- who may call what ----------
revoke execute on function mfg__cost_warn(uuid, text) from public, anon, authenticated;
revoke execute on function mfg__cost_line(uuid, uuid, int, uuid, uuid, uuid, int, text, text, numeric, text, numeric, numeric) from public, anon, authenticated;
revoke execute on function mfg__cost_bom(uuid, uuid, uuid, uuid, numeric, date, int, uuid[]) from public, anon, authenticated;
revoke execute on function mfg__cost_item(uuid, uuid, uuid, numeric, date, int, int, int, uuid[]) from public, anon, authenticated;
revoke execute on function mfg_create_cost_estimate(uuid, numeric, date, int, int) from public, anon;
revoke execute on function mfg_release_lines(uuid) from public, anon;
revoke execute on function mfg_mark_cost_estimate(uuid) from public, anon;
revoke execute on function mfg_release_cost_estimate(uuid, date) from public, anon;
revoke execute on function mfg_moving_average(numeric, numeric, numeric, numeric) from public, anon;
revoke execute on function mfg_seed_master_data(uuid) from public, anon, authenticated;
revoke execute on function mfg_save_item(uuid, jsonb) from public, anon;
revoke execute on function mfg_save_routing(uuid, jsonb) from public, anon;
revoke execute on function mfg_copy_routing(uuid) from public, anon;
grant execute on function mfg_create_cost_estimate(uuid, numeric, date, int, int) to authenticated;
grant execute on function mfg_release_lines(uuid) to authenticated;
grant execute on function mfg_mark_cost_estimate(uuid) to authenticated;
grant execute on function mfg_release_cost_estimate(uuid, date) to authenticated;
grant execute on function mfg_moving_average(numeric, numeric, numeric, numeric) to authenticated;
grant execute on function mfg_save_item(uuid, jsonb) to authenticated;
grant execute on function mfg_save_routing(uuid, jsonb) to authenticated;
grant execute on function mfg_copy_routing(uuid) to authenticated;
