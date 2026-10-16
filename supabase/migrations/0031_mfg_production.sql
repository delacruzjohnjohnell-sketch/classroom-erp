-- ============================================================
-- Classroom ERP — migration 0031 (Manufacturing ERP, Phase 4a part 2: production orders to finished-goods receipt)
--
-- Needs 0023–0030. ADDITIVE ONLY.
--
-- A production order moves WIP like this (standard costing; actual costing differs only where noted):
--   issue material       Dr Work in process · Cr Raw materials / packaging / finished-goods inventory
--                        (at the item's standard cost × the quantity really issued; moving average under actual costing)
--                        + overhead charged as a % of bought material: Cr Applied overhead
--   confirmation         Dr Work in process · Cr Applied direct labor, Applied machine overhead, Applied fixed overhead
--                        (hours × the work center's planned rates; actual costing takes an employee's real hourly rate)
--   finished goods in    Dr Finished goods · Cr Work in process (good units × standard unit cost; under actual costing
--                        the order's real accumulated cost)
-- Anything left in WIP once the order is complete is the variance; it is settled in Phase 4b.
--
-- Backflush: a component flagged "backflush" is issued automatically when the last operation is confirmed, in proportion
-- to the good + scrap units confirmed. Explicit issue is the same posting done by hand.
--
-- ROLLBACK (drops only what this file created):
--   drop function if exists mfg_reconciliation(uuid), mfg_post_fg_receipt(uuid, numeric, uuid, text, date, date, text),
--     mfg_post_confirmation(uuid, int, numeric, numeric, text, numeric, numeric, numeric, boolean, date, uuid, text),
--     mfg_post_material_issue(uuid, jsonb, date, text), mfg__issue_components(uuid, uuid, jsonb, date, text, text),
--     mfg_order_availability(uuid), mfg_order_wip(uuid), mfg_set_component_backflush(uuid, uuid, boolean),
--     mfg_cancel_order(uuid), mfg_approve_order(uuid), mfg_release_order(uuid), mfg_create_order(uuid, numeric, date, date, int, int, boolean),
--     mfg__order_components(uuid, uuid, numeric, date);
--   drop table if exists mfg_order_costs, mfg_confirmations, mfg_prod_operations, mfg_prod_components, mfg_production_orders;
-- ============================================================

-- ---------- tables ----------
create table if not exists mfg_production_orders (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  document_number     text,                                          -- PRD-0001
  item_id             uuid not null references items(id) on delete cascade,
  bom_id              uuid not null references mfg_boms(id) on delete cascade,
  routing_id          uuid references mfg_routings(id) on delete cascade,
  qty_planned         numeric(18, 4) not null check (qty_planned > 0),
  qty_good            numeric(18, 6) not null default 0,
  qty_scrap           numeric(18, 6) not null default 0,
  qty_received        numeric(18, 6) not null default 0,
  status              text not null default 'CREATED' check (status in
    ('CREATED', 'PENDING_APPROVAL', 'RELEASED', 'PARTIALLY_CONFIRMED', 'CONFIRMED', 'DELIVERED', 'TECHNICALLY_COMPLETE', 'CLOSED', 'LOCKED', 'CANCELLED')),
  planned_start       date not null,
  planned_end         date,
  costing_method      text not null check (costing_method in ('STANDARD', 'ACTUAL')),
  std_unit_cost       numeric(18, 6) not null default 0,             -- standard cost per good unit when the order was created
  planned_cost        numeric(18, 6) not null default 0,
  bom_snapshot        jsonb not null default '{}'::jsonb,
  release_approved_by uuid,
  released_at         timestamptz,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now()
);
create index if not exists mfg_production_orders_idx on mfg_production_orders (tenant_id, status);

create table if not exists mfg_prod_components (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  order_id     uuid not null references mfg_production_orders(id) on delete cascade,
  line_no      int not null,
  item_id      uuid not null references items(id) on delete cascade,
  qty_required numeric(18, 6) not null check (qty_required >= 0),
  qty_issued   numeric(18, 6) not null default 0,
  location_id  uuid references mfg_storage_locations(id) on delete cascade,
  backflush    boolean not null default false,
  unique (order_id, line_no)
);

create table if not exists mfg_prod_operations (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  order_id             uuid not null references mfg_production_orders(id) on delete cascade,
  op_no                int not null,
  description          text,
  work_center_id       uuid not null references mfg_work_centers(id) on delete cascade,
  setup_min            numeric(12, 3) not null default 0,
  run_min_per_unit     numeric(12, 4) not null default 0,
  labor_min_per_unit   numeric(12, 4),
  machine_min_per_unit numeric(12, 4),
  teardown_min         numeric(12, 3) not null default 0,
  qty_confirmed        numeric(18, 6) not null default 0,
  setup_h_actual       numeric(18, 6) not null default 0,
  labor_h_actual       numeric(18, 6) not null default 0,
  machine_h_actual     numeric(18, 6) not null default 0,
  unique (order_id, op_no)
);

create table if not exists mfg_confirmations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  document_number  text,                                             -- CNF-0001
  order_id         uuid not null references mfg_production_orders(id) on delete cascade,
  op_no            int,
  posting_date     date not null,
  yield_qty        numeric(18, 6) not null default 0,
  scrap_qty        numeric(18, 6) not null default 0,
  scrap_reason     text,
  setup_h          numeric(18, 6) not null default 0,
  labor_h          numeric(18, 6) not null default 0,
  machine_h        numeric(18, 6) not null default 0,
  employee_id      uuid,
  labor_cost       numeric(18, 2) not null default 0,
  machine_cost     numeric(18, 2) not null default 0,
  fixed_oh_cost    numeric(18, 2) not null default 0,
  var_oh_cost      numeric(18, 2) not null default 0,
  is_final         boolean not null default false,
  reversal_of      uuid references mfg_confirmations(id),
  journal_entry_id uuid references journal_entries(id) on delete set null,
  idempotency_key  text,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);
create unique index if not exists mfg_confirmations_key on mfg_confirmations (tenant_id, idempotency_key) where idempotency_key is not null;

-- What each posting did to an order's work in process, by cost element. The WIP balance of an order is the sum.
create table if not exists mfg_order_costs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  order_id     uuid not null references mfg_production_orders(id) on delete cascade,
  posting_date date not null,
  source_type  text not null check (source_type in ('ISSUE', 'CONFIRMATION', 'RECEIPT', 'SETTLEMENT', 'REVERSAL')),
  source_id    uuid,
  element      text not null check (element in ('MATERIAL', 'LABOR', 'MACHINE', 'VAR_OH', 'FIX_OH', 'RELIEF', 'VARIANCE')),
  amount       numeric(18, 2) not null,                              -- + goes into WIP, − comes out
  created_at   timestamptz not null default now()
);
create index if not exists mfg_order_costs_idx on mfg_order_costs (order_id);

alter table mfg_production_orders enable row level security;
alter table mfg_prod_components enable row level security;
alter table mfg_prod_operations enable row level security;
alter table mfg_confirmations enable row level security;
alter table mfg_order_costs enable row level security;
do $$
declare t text;
begin
  foreach t in array array['mfg_production_orders', 'mfg_prod_components', 'mfg_prod_operations', 'mfg_confirmations', 'mfg_order_costs'] loop
    execute format('drop policy if exists "mfg read" on %I', t);
    execute format($f$create policy "mfg read" on %I for select
      using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING')$f$, t);
  end loop;
end $$;

drop trigger if exists trg_mfg_order_number on mfg_production_orders;
create trigger trg_mfg_order_number before insert on mfg_production_orders
  for each row execute function mfg_assign_number('production_order', 'PRD');
drop trigger if exists trg_mfg_confirmation_number on mfg_confirmations;
create trigger trg_mfg_confirmation_number before insert on mfg_confirmations
  for each row execute function mfg_assign_number('confirmation', 'CNF');

drop trigger if exists trg_mfg_no_edit_confirmation on mfg_confirmations;
create trigger trg_mfg_no_edit_confirmation before update or delete on mfg_confirmations
  for each row execute function mfg_block_mutation();
drop trigger if exists trg_mfg_no_edit_order_cost on mfg_order_costs;
create trigger trg_mfg_no_edit_order_cost before update or delete on mfg_order_costs
  for each row execute function mfg_block_mutation();

-- ---------- the one rule for "what does this order need" ----------
-- Direct components of a BOM for p_good good units, looking straight through phantoms. Same quantity rule as the
-- explosion and the cost estimate: start = good ÷ (1 − item scrap) ÷ (recipe yield), line scrap on top.
create or replace function mfg__order_components(p_tenant uuid, p_bom uuid, p_good numeric, p_date date)
returns table (item_id uuid, qty numeric) as $$
declare
  v_base numeric; v_start numeric; l record; v_need numeric; v_child uuid; r record;
begin
  select base_qty into v_base from mfg_boms where id = p_bom;
  v_start := round(p_good / mfg_yield_factor(p_bom), 6);
  for l in select bi.*, m.base_uom as comp_uom from mfg_bom_items bi join mfg_item_master m on m.item_id = bi.component_item_id
            where bi.bom_id = p_bom and bi.kind = 'COMPONENT' order by bi.line_no loop
    v_need := round(mfg_convert_qty(p_tenant, l.component_item_id, round(v_start / v_base * l.qty * (1 + l.scrap_pct / 100), 6), l.uom, l.comp_uom), 6);
    if l.is_phantom then
      v_child := mfg_active_bom(p_tenant, l.component_item_id, p_date, 1);
      if v_child is null then raise exception 'A phantom component has no active bill of materials to pass through.'; end if;
      for r in select * from mfg__order_components(p_tenant, v_child, v_need, p_date) loop
        item_id := r.item_id; qty := r.qty; return next;
      end loop;
    else
      item_id := l.component_item_id; qty := v_need; return next;
    end if;
  end loop;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- order lifecycle ----------
create or replace function mfg_create_order(p_item uuid, p_qty numeric, p_start date default current_date, p_end date default null,
                                            p_bom_alt int default 1, p_routing_alt int default 1, p_backflush boolean default false)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text := mfg__method(v_t);
  v_name text; v_bom uuid; v_rt uuid; v_std numeric := 0; v_id uuid; c record; o record; n int := 0;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity above zero.'; end if;
  select i.name into v_name from items i join mfg_item_master m on m.item_id = i.id
   where i.id = p_item and i.tenant_id = v_t and m.make_or_buy = 'MAKE' and m.active;
  if v_name is null then raise exception 'Choose an item you make. Only items marked "Make" can be produced.'; end if;
  v_bom := mfg_active_bom(v_t, p_item, coalesce(p_start, current_date), p_bom_alt);
  if v_bom is null then raise exception 'There is no active bill of materials for "%" on %. Activate one first.', v_name, to_char(coalesce(p_start, current_date), 'Mon DD, YYYY'); end if;
  if v_method = 'STANDARD' then v_std := mfg__item_cost(v_t, p_item); end if;
  select id into v_rt from mfg_routings where tenant_id = v_t and item_id = p_item and alt_no = p_routing_alt and status = 'ACTIVE';

  insert into mfg_production_orders (tenant_id, item_id, bom_id, routing_id, qty_planned, planned_start, planned_end, costing_method,
                                     std_unit_cost, planned_cost, bom_snapshot)
  values (v_t, p_item, v_bom, v_rt, p_qty, coalesce(p_start, current_date), p_end, v_method, v_std, round(p_qty * v_std, 2),
          (select jsonb_build_object('bom', b.document_number, 'version', b.version, 'alt', b.alt_no, 'yield_pct', b.yield_pct) from mfg_boms b where b.id = v_bom))
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
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Release; above the company's approval threshold it waits for the teacher instead. Returns the new status.
create or replace function mfg_release_order(p_order uuid)
returns text as $$
declare
  v_t uuid := mfg__my_tenant();
  o mfg_production_orders; v_threshold numeric;
begin
  select * into o from mfg_production_orders where id = p_order and tenant_id = v_t for update;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  if o.status <> 'CREATED' then raise exception 'Only a new order can be released (this one is %).', lower(replace(o.status, '_', ' ')); end if;
  select approval_threshold into v_threshold from tenants where id = v_t;
  if v_threshold is not null and o.planned_cost > v_threshold then
    update mfg_production_orders set status = 'PENDING_APPROVAL' where id = p_order;
    return 'PENDING_APPROVAL';
  end if;
  update mfg_production_orders set status = 'RELEASED', released_at = now() where id = p_order;
  return 'RELEASED';
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_approve_order(p_order uuid)
returns void as $$
declare
  o mfg_production_orders;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can approve a production order.'; end if;
  select * into o from mfg_production_orders where id = p_order for update;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  perform assert_mfg_tenant(o.tenant_id);
  if o.status <> 'PENDING_APPROVAL' then raise exception 'That order is not waiting for approval (it is %).', lower(replace(o.status, '_', ' ')); end if;
  update mfg_production_orders set status = 'RELEASED', released_at = now(), release_approved_by = auth.uid() where id = p_order;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (o.tenant_id, 'production_order_approved', jsonb_build_object('order', o.document_number, 'planned_cost', o.planned_cost), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_cancel_order(p_order uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  o mfg_production_orders;
begin
  select * into o from mfg_production_orders where id = p_order and tenant_id = v_t for update;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  if o.status not in ('CREATED', 'PENDING_APPROVAL', 'RELEASED') or exists (select 1 from mfg_order_costs where order_id = p_order) then
    raise exception 'This order already has stock or cost posted to it, so it can''t be cancelled.';
  end if;
  update mfg_production_orders set status = 'CANCELLED' where id = p_order;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_set_component_backflush(p_order uuid, p_component uuid, p_flag boolean)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  o mfg_production_orders;
begin
  select * into o from mfg_production_orders where id = p_order and tenant_id = v_t;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  if o.status not in ('CREATED', 'PENDING_APPROVAL', 'RELEASED') then raise exception 'Backflushing can only be changed before production starts.'; end if;
  update mfg_prod_components set backflush = coalesce(p_flag, false) where id = p_component and order_id = p_order;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_order_wip(p_order uuid)
returns numeric as $$
  select coalesce(sum(amount), 0) from mfg_order_costs where order_id = p_order;
$$ language sql stable security definer set search_path = public;

-- What each component needs against what is on hand (all locations except the shop floor).
create or replace function mfg_order_availability(p_order uuid)
returns table (component_id uuid, item_id uuid, item_name text, uom text, required numeric, issued numeric, on_hand numeric, short numeric) as $$
  select c.id, c.item_id, i.name, m.base_uom, c.qty_required, c.qty_issued,
         coalesce((select sum(s.qty) from mfg_stock s join mfg_storage_locations sl on sl.id = s.location_id
                    where s.item_id = c.item_id and s.tenant_id = c.tenant_id and sl.kind <> 'WIP'), 0),
         greatest(c.qty_required - c.qty_issued - coalesce((select sum(s.qty) from mfg_stock s join mfg_storage_locations sl on sl.id = s.location_id
                    where s.item_id = c.item_id and s.tenant_id = c.tenant_id and sl.kind <> 'WIP'), 0), 0)
    from mfg_prod_components c join items i on i.id = c.item_id join mfg_item_master m on m.item_id = c.item_id
   where c.order_id = p_order order by c.line_no;
$$ language sql stable set search_path = public;

-- ---------- material issue (explicit and backflush share this) ----------
create or replace function mfg__issue_components(p_tenant uuid, p_order uuid, p_issues jsonb, p_date date, p_key text, p_memo text)
returns uuid as $$
declare
  o mfg_production_orders; v_doc uuid; v_je uuid; v_docno text;
  ln jsonb; comp record; q numeric; loc uuid; v_unit numeric; pk record; v_n int := 0; v_key text; k text; amt numeric;
  v_keys jsonb := '{}'::jsonb; v_wip numeric := 0; v_buy numeric := 0; v_oh_f numeric := 0; v_oh_v numeric := 0; ohm numeric; cs record; v_lines jsonb := '[]'::jsonb;
begin
  select * into o from mfg_production_orders where id = p_order and tenant_id = p_tenant;
  if o.id is null then raise exception 'That production order was not found.'; end if;
  if o.status not in ('RELEASED', 'PARTIALLY_CONFIRMED') then
    raise exception 'Material can be issued only to a released order (this one is %).', lower(replace(o.status, '_', ' '));
  end if;
  v_doc := mfg__doc(p_tenant, 'GI', p_date, 'mfg_production_orders', p_order, p_memo, p_key);
  select document_number into v_docno from mfg_material_documents where id = v_doc;

  for ln in select * from jsonb_array_elements(p_issues) loop
    q := coalesce(nullif(ln->>'qty', '')::numeric, 0);
    if q = 0 then continue; end if;
    if q < 0 then raise exception 'An issued quantity can''t be negative.'; end if;
    select c.*, m.item_type, m.make_or_buy, m.default_location_id, i.name into comp
      from mfg_prod_components c join mfg_item_master m on m.item_id = c.item_id join items i on i.id = c.item_id
     where c.id = nullif(ln->>'component_id', '')::uuid and c.order_id = p_order;
    if comp.id is null then raise exception 'One of the components is not on this order.'; end if;
    v_key := mfg__inv_key(comp.item_type);
    if v_key is null then raise exception '"%" has no stock to issue.', comp.name; end if;
    loc := coalesce(nullif(ln->>'location_id', '')::uuid, comp.location_id, comp.default_location_id,
                    (select id from mfg_storage_locations where tenant_id = p_tenant and code = 'RM-STORE'));
    if not exists (select 1 from mfg_storage_locations where id = loc and tenant_id = p_tenant and kind <> 'WIP') then
      raise exception '"%": choose the store to issue from.', comp.name;
    end if;
    v_unit := mfg__item_cost(p_tenant, comp.item_id);
    for pk in select * from mfg__pick(p_tenant, comp.item_id, loc, q) loop
      v_n := v_n + 1;
      perform mfg__move(v_doc, p_tenant, v_n, comp.item_id, loc, pk.batch_id, -pk.qty, v_unit, null);
    end loop;
    amt := round(q * v_unit, 2);
    v_keys := jsonb_set(v_keys, array[v_key], to_jsonb(coalesce((v_keys->>v_key)::numeric, 0) + amt));
    v_wip := v_wip + amt;
    if comp.make_or_buy = 'BUY' then v_buy := v_buy + amt; end if;
    update mfg_prod_components set qty_issued = qty_issued + q where id = comp.id;
  end loop;
  if v_n = 0 then raise exception 'Enter a quantity to issue on at least one component.'; end if;

  for cs in select * from mfg_costing_sheet where tenant_id = p_tenant and active and oh_pct > 0 and base in ('MATERIAL', 'BOTH') loop
    ohm := round(v_buy * cs.oh_pct / 100, 2);
    if cs.kind = 'FIXED' then v_oh_f := v_oh_f + ohm; else v_oh_v := v_oh_v + ohm; end if;
  end loop;

  v_lines := v_lines || jsonb_build_object('key', 'WIP', 'debit', v_wip + v_oh_f + v_oh_v);
  for k in select jsonb_object_keys(v_keys) loop
    v_lines := v_lines || jsonb_build_object('key', k, 'credit', (v_keys->>k)::numeric);
  end loop;
  if v_oh_f <> 0 then v_lines := v_lines || jsonb_build_object('key', 'APPLIED_FIXED_OH', 'credit', v_oh_f); end if;
  if v_oh_v <> 0 then v_lines := v_lines || jsonb_build_object('key', 'APPLIED_MACHINE', 'credit', v_oh_v); end if;
  v_je := mfg__post_entry(p_tenant, p_date, 'Material issue ' || v_docno || ' to order ' || coalesce(o.document_number, ''), 'mfg_material_documents', v_doc, v_lines);
  update mfg_material_documents set journal_entry_id = v_je where id = v_doc;

  insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount) values (p_tenant, p_order, p_date, 'ISSUE', v_doc, 'MATERIAL', v_wip);
  if v_oh_f <> 0 then insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount) values (p_tenant, p_order, p_date, 'ISSUE', v_doc, 'FIX_OH', v_oh_f); end if;
  if v_oh_v <> 0 then insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount) values (p_tenant, p_order, p_date, 'ISSUE', v_doc, 'VAR_OH', v_oh_v); end if;
  return v_doc;
end;
$$ language plpgsql security definer set search_path = public;

-- p_lines: [{"component_id": …, "qty": 310, "location_id": …?}]
create or replace function mfg_post_material_issue(p_order uuid, p_lines jsonb, p_date date, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_doc uuid;
begin
  if p_key is not null then
    select id into v_doc from mfg_material_documents where tenant_id = v_t and idempotency_key = p_key;
    if v_doc is not null then return v_doc; end if;
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Enter a quantity to issue on at least one component.'; end if;
  perform 1 from mfg_production_orders where id = p_order and tenant_id = v_t for update;
  return mfg__issue_components(v_t, p_order, p_lines, coalesce(p_date, current_date), p_key, 'Material issue');
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- confirmation: yield, scrap and the hours worked ----------
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

  -- cost of the hours
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

  -- backflush on the last operation: good + scrap units × what one planned unit needs
  if v_is_last and (y + s) > 0 then
    for comp in select * from mfg_prod_components where order_id = p_order and backflush order by line_no loop
      v_bf := v_bf || jsonb_build_object('component_id', comp.id, 'qty', round(comp.qty_required / o.qty_planned * (y + s), 6));
    end loop;
    if jsonb_array_length(v_bf) > 0 then
      perform mfg__issue_components(v_t, p_order, v_bf, v_date, null, 'Backflush for production confirmation');
    end if;
  end if;

  v_id := gen_random_uuid();
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

-- ---------- finished goods into stock ----------
create or replace function mfg_post_fg_receipt(p_order uuid, p_qty numeric, p_location uuid, p_batch_no text, p_expiry date, p_date date, p_key text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_method text := mfg__method(v_t);
  o mfg_production_orders; v_doc uuid; v_docno text; v_je uuid; v_date date := coalesce(p_date, current_date);
  it record; v_key text; v_avail numeric; v_wip numeric; v_unit numeric; v_amt numeric; v_loc uuid; v_batch uuid; v_oldqty numeric; v_avg numeric;
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

  v_wip := mfg_order_wip(p_order);
  if v_method = 'STANDARD' then
    v_unit := o.std_unit_cost;
    v_amt := round(p_qty * v_unit, 2);
  else
    if abs(p_qty - v_avail) < 0.000001 then
      v_amt := round(v_wip, 2);
    else
      v_amt := round(p_qty * v_wip / v_avail, 2);
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
  insert into mfg_order_costs (tenant_id, order_id, posting_date, source_type, source_id, element, amount) values (v_t, p_order, v_date, 'RECEIPT', v_doc, 'RELIEF', -v_amt);
  update mfg_production_orders
     set qty_received = qty_received + p_qty,
         status = case when status = 'CONFIRMED' and qty_received + p_qty >= qty_good - 0.000001 then 'DELIVERED' else status end
   where id = p_order;
  return v_doc;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- does the stock sub-ledger agree with the general ledger? ----------
-- One row per control account. Stock is valued at standard cost (or the moving average under actual costing);
-- work in process is the sum of every order's cost postings. A difference of a few centavos is rounding.
create or replace function mfg_reconciliation(p_tenant uuid default null)
returns table (area text, account_code text, account_name text, subledger numeric, ledger numeric, difference numeric) as $$
declare
  t uuid := coalesce(p_tenant, my_tenant_id());
  v_method text;
begin
  select costing_method into v_method from mfg_company_settings where tenant_id = t;
  return query
  with gl_bal as (
    select a.id, a.code, a.name, coalesce(sum(jl.debit - jl.credit), 0) as bal
      from accounts a left join journal_lines jl on jl.account_id = a.id
     where a.tenant_id = t group by a.id, a.code, a.name
  ), keyed as (
    select d.key, g.code, g.name, g.bal from mfg_account_determination d join gl_bal g on g.id = d.account_id where d.tenant_id = t
  ), stock as (
    select mfg__inv_key(m.item_type) as key,
           coalesce(sum(s.qty * case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end), 0) as val
      from mfg_stock s join mfg_item_master m on m.item_id = s.item_id where s.tenant_id = t group by 1
  ), pairs(a_name, a_key) as (values ('Raw materials', 'RM_INVENTORY'), ('Packaging & supplies', 'PACKAGING_INVENTORY'), ('Finished goods', 'FG_INVENTORY'))
  select p.a_name, k.code, k.name, round(coalesce(s.val, 0), 2), round(k.bal, 2), round(coalesce(s.val, 0) - k.bal, 2)
    from pairs p join keyed k on k.key = p.a_key left join stock s on s.key = p.a_key
  union all
  select 'Work in process', k.code, k.name, round(coalesce((select sum(amount) from mfg_order_costs where tenant_id = t), 0), 2), round(k.bal, 2),
         round(coalesce((select sum(amount) from mfg_order_costs where tenant_id = t), 0) - k.bal, 2)
    from keyed k where k.key = 'WIP'
  union all
  select 'Received, not yet invoiced (GR/IR)', k.code, k.name,
         round(coalesce((select sum(dl.qty_change * pl.unit_cost) from mfg_material_doc_lines dl join purchase_order_lines pl on pl.id = dl.po_line_id where dl.tenant_id = t), 0), 2),
         round(-k.bal, 2),
         round(coalesce((select sum(dl.qty_change * pl.unit_cost) from mfg_material_doc_lines dl join purchase_order_lines pl on pl.id = dl.po_line_id where dl.tenant_id = t), 0) + k.bal, 2)
    from keyed k where k.key = 'GR_IR';
end;
$$ language plpgsql stable set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg__order_components(uuid, uuid, numeric, date) from public, anon, authenticated;
revoke execute on function mfg__issue_components(uuid, uuid, jsonb, date, text, text) from public, anon, authenticated;
revoke execute on function mfg_create_order(uuid, numeric, date, date, int, int, boolean) from public, anon;
revoke execute on function mfg_release_order(uuid) from public, anon;
revoke execute on function mfg_approve_order(uuid) from public, anon;
revoke execute on function mfg_cancel_order(uuid) from public, anon;
revoke execute on function mfg_set_component_backflush(uuid, uuid, boolean) from public, anon;
revoke execute on function mfg_order_wip(uuid) from public, anon;
revoke execute on function mfg_order_availability(uuid) from public, anon;
revoke execute on function mfg_post_material_issue(uuid, jsonb, date, text) from public, anon;
revoke execute on function mfg_post_confirmation(uuid, int, numeric, numeric, text, numeric, numeric, numeric, boolean, date, uuid, text) from public, anon;
revoke execute on function mfg_post_fg_receipt(uuid, numeric, uuid, text, date, date, text) from public, anon;
revoke execute on function mfg_reconciliation(uuid) from public, anon;
grant execute on function mfg_create_order(uuid, numeric, date, date, int, int, boolean) to authenticated;
grant execute on function mfg_release_order(uuid) to authenticated;
grant execute on function mfg_approve_order(uuid) to authenticated;
grant execute on function mfg_cancel_order(uuid) to authenticated;
grant execute on function mfg_set_component_backflush(uuid, uuid, boolean) to authenticated;
grant execute on function mfg_order_wip(uuid) to authenticated;
grant execute on function mfg_order_availability(uuid) to authenticated;
grant execute on function mfg_post_material_issue(uuid, jsonb, date, text) to authenticated;
grant execute on function mfg_post_confirmation(uuid, int, numeric, numeric, text, numeric, numeric, numeric, boolean, date, uuid, text) to authenticated;
grant execute on function mfg_post_fg_receipt(uuid, numeric, uuid, text, date, date, text) to authenticated;
grant execute on function mfg_reconciliation(uuid) to authenticated;
