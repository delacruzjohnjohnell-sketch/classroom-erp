-- ============================================================
-- Classroom ERP — migration 0034 (Manufacturing ERP, Phase 5a: forecasts, MRP, planned orders, requisitions, exceptions, pegging)
--
-- Needs 0023–0033. ADDITIVE ONLY: new tables and functions. No Standard table, function, policy or trigger is changed, and no
-- existing Manufacturing function is redefined.
--
--   forecasts          what the company expects to sell per month (mfg_save_forecast).
--   MRP run            mfg_run_mrp reads every demand the company knows about and plans what to make and what to buy:
--                        demand   open sales orders (the part not yet delivered), forecast not yet consumed by sales orders,
--                                 components still to be issued to open production orders, components of firm planned orders,
--                                 and the components of the planned orders the run itself creates (dependent demand)
--                        supply   stock in the raw-material and finished-goods stores, open purchase orders (not yet received),
--                                 open production orders (not yet received into stock), firm planned orders
--                        items are planned top-down by low-level code, so a sub-assembly is planned before its components
--                        netting  per time bucket: projected stock = stock + receipts − requirements; when it falls below the
--                                 safety stock the shortage is covered by a planned order (make) or a purchase requisition (buy),
--                                 sized by the item's lot rule (LOT_FOR_LOT, FIXED, EOQ, MIN_MAX, PERIODIC), grossed up for the
--                                 item's scrap %, and started a lead time earlier
--   pegging            each requirement is matched first-come-first-served to the supply that covers it (stock, an order, a
--                        planned order), so a student can answer "why is this being made?"
--   exceptions         LATE_START (should have started before today), PAST_DUE_RECEIPT (an order that should have arrived),
--                        NO_ACTIVE_BOM, RESCHEDULE_IN (an order arrives later than the first shortage), NOT_NEEDED
--   conversion         a planned order becomes a real production order, requisitions become one purchase order
--                        (both through the existing mfg_create_order / mfg_create_po)
--
-- Only the latest run's detail (grid, demand, pegging, exceptions) is kept; earlier runs stay in the run list. A new run
-- deletes the open planned orders and requisitions of earlier runs that nobody converted (status DELETED).
-- The whole run is one transaction: if it fails nothing is saved (so a FAILED row never exists; the status is reserved).
--
-- ROLLBACK (drops only what this file created):
--   drop function if exists mfg_convert_requisitions(uuid, jsonb), mfg_convert_planned_order(uuid, boolean), mfg_delete_requisition(uuid),
--     mfg_delete_planned_order(uuid), mfg_create_planned_order(uuid, numeric, date, date), mfg_save_forecast(uuid, date, numeric),
--     mfg_run_mrp(int, int, boolean, date), mfg__mrp_exc(uuid, uuid, uuid, text, text, text, uuid, date), mfg__mrp_supply(uuid, uuid, date),
--     mfg__lot_qty(text, numeric, numeric, numeric, numeric), mfg__bucket(date, date, int, int);
--   drop table if exists mfg_pegging, mfg_mrp_exceptions, mfg_mrp_grid, mfg_mrp_demand, mfg_purchase_reqs, mfg_planned_orders, mfg_mrp_runs, mfg_forecasts;
-- ============================================================

-- ---------- tables ----------
create table if not exists mfg_forecasts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  item_id      uuid not null references items(id) on delete cascade,
  period_start date not null check (extract(day from period_start) = 1),   -- the first day of the month
  qty          numeric(18, 6) not null check (qty > 0),
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (tenant_id, item_id, period_start)
);

create table if not exists mfg_mrp_runs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  document_number  text,                                           -- MRP-0001
  status           text not null default 'RUNNING' check (status in ('RUNNING', 'DONE', 'FAILED')),
  start_date       date not null,
  horizon_days     int not null check (horizon_days between 7 and 365),
  bucket_days      int not null check (bucket_days in (1, 7, 14, 30)),
  bucket_count     int not null check (bucket_count between 1 and 60),
  include_forecast boolean not null default true,
  items_planned    int not null default 0,
  planned_orders   int not null default 0,
  requisitions     int not null default 0,
  exceptions       int not null default 0,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  created_by       uuid default auth.uid()
);
create index if not exists mfg_mrp_runs_idx on mfg_mrp_runs (tenant_id, started_at desc);

create table if not exists mfg_planned_orders (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  document_number  text,                                           -- PLN-0001
  run_id           uuid references mfg_mrp_runs(id) on delete set null,
  item_id          uuid not null references items(id) on delete cascade,
  qty              numeric(18, 6) not null check (qty > 0),         -- the quantity to start (before scrap)
  start_date       date not null,
  finish_date      date not null,
  source           text not null check (source in ('MRP', 'MANUAL')),
  firm             boolean not null default false,                  -- firm orders are kept by the next run and counted as supply
  status           text not null default 'OPEN' check (status in ('OPEN', 'CONVERTED', 'DELETED')),
  converted_to_id  uuid,                                            -- the production order it became
  late_days        int not null default 0,                          -- how late it will finish because it should already have started
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  check (finish_date >= start_date)
);
create index if not exists mfg_planned_orders_idx on mfg_planned_orders (tenant_id, status);
create index if not exists mfg_planned_orders_item on mfg_planned_orders (tenant_id, item_id);
create index if not exists mfg_planned_orders_run on mfg_planned_orders (run_id);

create table if not exists mfg_purchase_reqs (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  document_number  text,                                           -- PR-0001
  run_id           uuid references mfg_mrp_runs(id) on delete set null,
  item_id          uuid not null references items(id) on delete cascade,
  qty              numeric(18, 6) not null check (qty > 0),
  need_date        date not null,                                   -- when the goods are needed
  order_by_date    date not null,                                   -- when they must be ordered to arrive on time
  status           text not null default 'OPEN' check (status in ('OPEN', 'CONVERTED', 'DELETED')),
  po_id            uuid references purchase_orders(id) on delete set null,
  late_days        int not null default 0,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);
create index if not exists mfg_purchase_reqs_idx on mfg_purchase_reqs (tenant_id, status);
create index if not exists mfg_purchase_reqs_item on mfg_purchase_reqs (tenant_id, item_id);
create index if not exists mfg_purchase_reqs_run on mfg_purchase_reqs (run_id);

-- every requirement the run knew about
create table if not exists mfg_mrp_demand (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  run_id      uuid not null references mfg_mrp_runs(id) on delete cascade,
  item_id     uuid not null references items(id) on delete cascade,
  kind        text not null check (kind in ('SALES_ORDER', 'FORECAST', 'ORDER_COMPONENT', 'DEPENDENT')),
  source_id   uuid,
  source_ref  text,
  need_date   date not null,
  qty         numeric(18, 6) not null check (qty > 0)
);
create index if not exists mfg_mrp_demand_idx on mfg_mrp_demand (run_id, item_id);

-- the time-phased picture, one row per item per bucket
create table if not exists mfg_mrp_grid (
  run_id          uuid not null references mfg_mrp_runs(id) on delete cascade,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  item_id         uuid not null references items(id) on delete cascade,
  bucket_no       int not null,
  bucket_start    date not null,
  projected_start numeric(18, 6) not null,                          -- stock expected at the start of the bucket
  gross           numeric(18, 6) not null default 0,                -- requirements
  scheduled       numeric(18, 6) not null default 0,                -- receipts already on order
  net             numeric(18, 6) not null default 0,                -- the shortage the plan had to cover
  planned_receipt numeric(18, 6) not null default 0,                -- good quantity the plan brings in
  planned_release numeric(18, 6) not null default 0,                -- quantity the plan starts or orders in this bucket
  projected_end   numeric(18, 6) not null,
  primary key (run_id, item_id, bucket_no)
);

create table if not exists mfg_mrp_exceptions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  run_id     uuid not null references mfg_mrp_runs(id) on delete cascade,
  item_id    uuid not null references items(id) on delete cascade,
  kind       text not null check (kind in ('LATE_START', 'PAST_DUE_RECEIPT', 'NO_ACTIVE_BOM', 'RESCHEDULE_IN', 'NOT_NEEDED')),
  message    text not null,
  ref_kind   text,
  ref_id     uuid,
  ref_date   date
);
create index if not exists mfg_mrp_exceptions_idx on mfg_mrp_exceptions (run_id, item_id);

create table if not exists mfg_pegging (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  run_id       uuid not null references mfg_mrp_runs(id) on delete cascade,
  item_id      uuid not null references items(id) on delete cascade,
  demand_kind  text not null,
  demand_id    uuid,
  demand_ref   text,
  demand_date  date,
  supply_kind  text not null check (supply_kind in ('ONHAND', 'PURCHASE_ORDER', 'PRODUCTION_ORDER', 'PLANNED_ORDER', 'REQUISITION')),
  supply_id    uuid,
  supply_ref   text,
  supply_date  date,
  qty          numeric(18, 6) not null check (qty > 0)
);
create index if not exists mfg_pegging_idx on mfg_pegging (run_id, item_id);

-- ---------- security: read by the owning company and the teacher; writes only through the functions below ----------
alter table mfg_forecasts enable row level security;
alter table mfg_mrp_runs enable row level security;
alter table mfg_planned_orders enable row level security;
alter table mfg_purchase_reqs enable row level security;
alter table mfg_mrp_demand enable row level security;
alter table mfg_mrp_grid enable row level security;
alter table mfg_mrp_exceptions enable row level security;
alter table mfg_pegging enable row level security;
do $$
declare t text;
begin
  foreach t in array array['mfg_forecasts', 'mfg_mrp_runs', 'mfg_planned_orders', 'mfg_purchase_reqs', 'mfg_mrp_demand', 'mfg_mrp_grid', 'mfg_mrp_exceptions', 'mfg_pegging'] loop
    execute format('drop policy if exists "mfg read" on %I', t);
    execute format($f$create policy "mfg read" on %I for select
      using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING')$f$, t);
  end loop;
end $$;

drop trigger if exists trg_mfg_mrp_number on mfg_mrp_runs;
create trigger trg_mfg_mrp_number before insert on mfg_mrp_runs for each row execute function mfg_assign_number('mrp_run', 'MRP');
drop trigger if exists trg_mfg_planned_number on mfg_planned_orders;
create trigger trg_mfg_planned_number before insert on mfg_planned_orders for each row execute function mfg_assign_number('planned_order', 'PLN');
drop trigger if exists trg_mfg_req_number on mfg_purchase_reqs;
create trigger trg_mfg_req_number before insert on mfg_purchase_reqs for each row execute function mfg_assign_number('purchase_req', 'PR');

-- ---------- small pure helpers ----------
-- Which time bucket a date falls in: late dates go into the first bucket, dates beyond the horizon give -1.
create or replace function mfg__bucket(p_date date, p_start date, p_width int, p_count int)
returns int as $$
  select case when p_date is null then -1
              when p_date < p_start then 0
              when (p_date - p_start) / p_width >= p_count then -1
              else (p_date - p_start) / p_width end;
$$ language sql immutable;

-- The order quantities a lot rule gives for a shortage (an array: MIN_MAX can split one shortage into several orders).
--   LOT_FOR_LOT / PERIODIC  exactly the shortage (PERIODIC has already widened the shortage to several periods)
--   FIXED                   whole multiples of the lot size
--   EOQ                     the shortage, but never less than the economic order quantity
--   MIN_MAX                 at least the minimum lot; more than the maximum is split into maximum-sized orders
create or replace function mfg__lot_qty(p_rule text, p_need numeric, p_lot numeric, p_min numeric, p_max numeric)
returns numeric[] as $$
declare
  need numeric; rest numeric; res numeric[] := '{}';
begin
  if p_need is null or p_need <= 0 then return '{}'; end if;
  need := round(p_need, 6);
  if p_rule = 'FIXED' then
    return array[round(ceil(need / p_lot) * p_lot, 6)];
  elsif p_rule = 'EOQ' then
    return array[greatest(need, coalesce(p_lot, 0))];
  elsif p_rule = 'MIN_MAX' then
    rest := greatest(need, coalesce(p_min, 0));
    if coalesce(p_max, 0) > 0 then
      while rest > p_max + 0.000001 loop
        res := res || p_max;
        rest := rest - p_max;
      end loop;
      if rest > 0.000001 then res := res || greatest(rest, coalesce(p_min, 0)); end if;
      return res;
    end if;
    return array[rest];
  end if;
  return array[need];
end;
$$ language plpgsql immutable;

-- Supply already on its way for an item: open purchase orders, open production orders, firm planned orders.
create or replace function mfg__mrp_supply(p_tenant uuid, p_item uuid, p_start date)
returns table (kind text, id uuid, ref text, dt date, qty numeric) as $$
begin
  return query
  select 'PURCHASE_ORDER'::text, po.id, po.document_number, coalesce(po.expected_date, po.order_date),
         l.qty - coalesce((select sum(dl.qty_change) from mfg_material_doc_lines dl where dl.po_line_id = l.id), 0)
    from purchase_orders po
    join purchase_order_lines l on l.purchase_order_id = po.id
    join mfg_po_line_items li on li.po_line_id = l.id
   where po.tenant_id = p_tenant and li.item_id = p_item and po.status <> 'closed'
     and l.qty - coalesce((select sum(dl.qty_change) from mfg_material_doc_lines dl where dl.po_line_id = l.id), 0) > 0.000001;
  return query
  select 'PRODUCTION_ORDER'::text, o.id, o.document_number, coalesce(o.planned_end, o.planned_start, p_start), o.qty_planned - o.qty_received
    from mfg_production_orders o
   where o.tenant_id = p_tenant and o.item_id = p_item
     and o.status in ('CREATED', 'PENDING_APPROVAL', 'RELEASED', 'PARTIALLY_CONFIRMED', 'CONFIRMED')
     and o.qty_planned - o.qty_received > 0.000001;
  return query
  select 'PLANNED_ORDER'::text, p.id, p.document_number, p.finish_date, round(p.qty * (1 - m.scrap_pct / 100), 6)
    from mfg_planned_orders p join mfg_item_master m on m.item_id = p.item_id
   where p.tenant_id = p_tenant and p.item_id = p_item and p.status = 'OPEN' and p.firm;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg__mrp_exc(p_tenant uuid, p_run uuid, p_item uuid, p_kind text, p_message text, p_ref_kind text, p_ref_id uuid, p_ref_date date)
returns void as $$
begin
  insert into mfg_mrp_exceptions (tenant_id, run_id, item_id, kind, message, ref_kind, ref_id, ref_date)
  values (p_tenant, p_run, p_item, p_kind, p_message, p_ref_kind, p_ref_id, p_ref_date);
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- forecasts ----------
create or replace function mfg_save_forecast(p_item uuid, p_month date, p_qty numeric)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  v_month date;
begin
  if p_month is null then raise exception 'Choose the month.'; end if;
  v_month := date_trunc('month', p_month)::date;
  if not exists (select 1 from items i join mfg_item_master m on m.item_id = i.id
                  where i.id = p_item and i.tenant_id = v_t and m.active and m.item_type <> 'SERVICE') then
    raise exception 'Choose an item from your company.';
  end if;
  if p_qty is null or p_qty < 0 then raise exception 'The forecast can''t be negative. Use 0 to clear it.'; end if;
  if p_qty = 0 then
    delete from mfg_forecasts where tenant_id = v_t and item_id = p_item and period_start = v_month;
    return;
  end if;
  insert into mfg_forecasts (tenant_id, item_id, period_start, qty) values (v_t, p_item, v_month, p_qty)
  on conflict (tenant_id, item_id, period_start) do update set qty = excluded.qty;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the MRP run ----------
create or replace function mfg_run_mrp(p_horizon_days int default 84, p_bucket_days int default 7, p_include_forecast boolean default true, p_start date default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_start date := coalesce(p_start, current_date);
  nb int; v_run uuid; v_lvl int; v_max int;
  it record; r record; pl record;
  gross numeric[]; sched numeric[]; rcpt numeric[]; rel numeric[]; netq numeric[]; pstart numeric[]; pend numeric[];
  v_onhand numeric; v_proj numeric; v_acc numeric; v_best numeric; v_need numeric; v_q numeric; v_good numeric; v_scrap numeric;
  v_chunks numeric[]; v_lead int; v_rec date; v_st date; v_fin date; v_late int; v_bom uuid; v_id uuid; v_no text;
  i int; j int; k int; b int; has_dem boolean; has_sched boolean; first_b int; short_without boolean; pm numeric; no_bom boolean;
  n_items int := 0; n_pl int; n_rq int; n_ex int;
begin
  if p_bucket_days is null or p_bucket_days not in (1, 7, 14, 30) then raise exception 'Choose a bucket of 1, 7, 14 or 30 days.'; end if;
  if p_horizon_days is null or p_horizon_days < 7 or p_horizon_days > 365 then raise exception 'The planning horizon must be between 7 and 365 days.'; end if;
  nb := ceil(p_horizon_days::numeric / p_bucket_days)::int;
  if nb > 60 then raise exception 'That is % buckets. Use a longer bucket or a shorter horizon (60 buckets at most).', nb; end if;
  perform pg_advisory_xact_lock(hashtext('mfg_mrp' || v_t::text));

  -- tidy up: unconverted suggestions of earlier runs are replaced; only the latest run keeps its detail
  update mfg_planned_orders set status = 'DELETED' where tenant_id = v_t and status = 'OPEN' and source = 'MRP' and not firm;
  update mfg_purchase_reqs set status = 'DELETED' where tenant_id = v_t and status = 'OPEN';
  delete from mfg_pegging where tenant_id = v_t;
  delete from mfg_mrp_exceptions where tenant_id = v_t;
  delete from mfg_mrp_grid where tenant_id = v_t;
  delete from mfg_mrp_demand where tenant_id = v_t;

  insert into mfg_mrp_runs (tenant_id, start_date, horizon_days, bucket_days, bucket_count, include_forecast)
  values (v_t, v_start, p_horizon_days, p_bucket_days, nb, coalesce(p_include_forecast, true)) returning id into v_run;
  perform mfg_recalc_low_level(v_t);

  -- 1. demand we already know about -------------------------------------------------------------------------------
  insert into mfg_mrp_demand (tenant_id, run_id, item_id, kind, source_id, source_ref, need_date, qty)
  select v_t, v_run, sl.item_id, 'SALES_ORDER', so.id, so.document_number, greatest(coalesce(so.expected_date, so.order_date), v_start),
         sl.qty - coalesce((select sum(-dl.qty_change) from mfg_material_doc_lines dl where dl.so_line_id = sl.id), 0)
    from sales_orders so
    join sales_order_lines sl on sl.sales_order_id = so.id
    join mfg_item_master m on m.item_id = sl.item_id and m.active and m.item_type <> 'SERVICE'
   where so.tenant_id = v_t and so.status in ('confirmed', 'invoiced')
     and sl.qty - coalesce((select sum(-dl.qty_change) from mfg_material_doc_lines dl where dl.so_line_id = sl.id), 0) > 0.000001;

  if coalesce(p_include_forecast, true) then
    -- a forecast month is used up by the sales orders already due in that month
    insert into mfg_mrp_demand (tenant_id, run_id, item_id, kind, source_id, source_ref, need_date, qty)
    select v_t, v_run, f.item_id, 'FORECAST', f.id, 'Forecast ' || to_char(f.period_start, 'Mon YYYY'), greatest(f.period_start, v_start),
           f.qty - coalesce(c.q, 0)
      from mfg_forecasts f
      join mfg_item_master m on m.item_id = f.item_id and m.active and m.item_type <> 'SERVICE'
      left join lateral (select sum(d.qty) q from mfg_mrp_demand d
                          where d.run_id = v_run and d.item_id = f.item_id and d.kind = 'SALES_ORDER'
                            and d.need_date >= f.period_start and d.need_date < (f.period_start + interval '1 month')::date) c on true
     where f.tenant_id = v_t and (f.period_start + interval '1 month')::date > v_start
       and f.qty - coalesce(c.q, 0) > 0.000001;
  end if;

  insert into mfg_mrp_demand (tenant_id, run_id, item_id, kind, source_id, source_ref, need_date, qty)
  select v_t, v_run, pc.item_id, 'ORDER_COMPONENT', o.id, o.document_number, greatest(coalesce(o.planned_start, v_start), v_start), pc.qty_required - pc.qty_issued
    from mfg_prod_components pc
    join mfg_production_orders o on o.id = pc.order_id
   where pc.tenant_id = v_t and o.status in ('CREATED', 'PENDING_APPROVAL', 'RELEASED', 'PARTIALLY_CONFIRMED')
     and pc.qty_required - pc.qty_issued > 0.000001;

  for pl in select p.id, p.document_number, p.item_id, p.qty, p.start_date from mfg_planned_orders p
             where p.tenant_id = v_t and p.status = 'OPEN' and p.firm loop
    v_bom := mfg_active_bom(v_t, pl.item_id, pl.start_date, 1);
    if v_bom is not null then
      insert into mfg_mrp_demand (tenant_id, run_id, item_id, kind, source_id, source_ref, need_date, qty)
      select v_t, v_run, c.item_id, 'DEPENDENT', pl.id, pl.document_number, greatest(pl.start_date, v_start), sum(c.qty)
        from mfg__order_components(v_t, v_bom, pl.qty, pl.start_date) c group by c.item_id having sum(c.qty) > 0.000001;
    end if;
  end loop;

  -- 2. plan item by item, parents before their components ---------------------------------------------------------
  select coalesce(max(low_level_code), 0) into v_max from mfg_item_master where tenant_id = v_t;
  for v_lvl in 0..v_max loop
    for it in select m.*, i.name as item_name from mfg_item_master m join items i on i.id = m.item_id
               where m.tenant_id = v_t and m.active and m.item_type <> 'SERVICE' and m.low_level_code = v_lvl order by i.name loop
      gross := array_fill(0::numeric, array[nb]);
      sched := array_fill(0::numeric, array[nb]);
      rcpt := array_fill(0::numeric, array[nb]);
      rel := array_fill(0::numeric, array[nb]);
      netq := array_fill(0::numeric, array[nb]);
      pstart := array_fill(0::numeric, array[nb]);
      pend := array_fill(0::numeric, array[nb]);
      has_dem := false; has_sched := false; no_bom := false; first_b := null;
      v_scrap := least(coalesce(it.scrap_pct, 0), 95);

      for r in select mfg__bucket(d.need_date, v_start, p_bucket_days, nb) as b, sum(d.qty) as q from mfg_mrp_demand d
                where d.run_id = v_run and d.item_id = it.item_id group by 1 loop
        if r.b >= 0 then gross[r.b + 1] := r.q; has_dem := true; end if;
      end loop;
      for r in select * from mfg__mrp_supply(v_t, it.item_id, v_start) loop
        has_sched := true;
        b := mfg__bucket(r.dt, v_start, p_bucket_days, nb);
        if b >= 0 then sched[b + 1] := sched[b + 1] + r.qty; end if;
      end loop;
      if not has_dem and coalesce(it.safety_stock, 0) <= 0 and not has_sched then continue; end if;

      select coalesce(sum(s.qty), 0) into v_onhand from mfg_stock s join mfg_storage_locations l on l.id = s.location_id
       where s.tenant_id = v_t and s.item_id = it.item_id and l.kind in ('RM', 'FG');
      v_onhand := greatest(v_onhand, 0);
      v_lead := case when it.make_or_buy = 'MAKE' then coalesce(it.production_lead_days, 0) else coalesce(it.procurement_lead_days, 0) end;
      n_items := n_items + 1;

      v_proj := v_onhand;
      for i in 0..nb - 1 loop
        pstart[i + 1] := v_proj;
        v_proj := v_proj + sched[i + 1] - gross[i + 1];
        if v_proj < coalesce(it.safety_stock, 0) - 0.000001 then
          v_need := it.safety_stock - v_proj;
          netq[i + 1] := v_need;
          if it.lot_rule = 'PERIODIC' then                         -- cover this bucket and the next (lot_size − 1) buckets
            k := greatest(1, round(coalesce(it.lot_size, 1))::int);
            v_acc := v_proj; v_best := v_need;
            for j in i + 1..least(i + k - 1, nb - 1) loop
              v_acc := v_acc + sched[j + 1] - gross[j + 1];
              v_best := greatest(v_best, it.safety_stock - v_acc);
            end loop;
            v_need := v_best;
          end if;
          v_chunks := mfg__lot_qty(it.lot_rule, round(v_need / (1 - v_scrap / 100), 6), it.lot_size, it.min_lot, it.max_lot);
          foreach v_q in array v_chunks loop
            v_good := round(v_q * (1 - v_scrap / 100), 6);
            rcpt[i + 1] := rcpt[i + 1] + v_good;
            v_proj := v_proj + v_good;
            v_rec := v_start + i * p_bucket_days;
            v_st := v_rec - v_lead; v_fin := v_rec; v_late := 0;
            if v_st < v_start then
              v_late := v_start - v_st;
              if it.make_or_buy = 'MAKE' then
                v_fin := v_start + v_lead;
                perform mfg__mrp_exc(v_t, v_run, it.item_id, 'LATE_START',
                  it.item_name || ': ' || trim_scale(v_q)::text || ' ' || it.base_uom || ' were needed on ' || to_char(v_rec, 'Mon DD') || ', which means starting on ' ||
                  to_char(v_st, 'Mon DD') || ' — before today. The plan starts today and finishes ' || v_late || ' day' || case when v_late = 1 then '' else 's' end || ' late.',
                  'item', it.item_id, v_rec);
              else
                perform mfg__mrp_exc(v_t, v_run, it.item_id, 'LATE_START',
                  it.item_name || ': ' || trim_scale(v_q)::text || ' ' || it.base_uom || ' were needed on ' || to_char(v_rec, 'Mon DD') || ', so they should have been ordered on ' ||
                  to_char(v_st, 'Mon DD') || ' (' || v_lead || '-day lead time). Order now and expect them ' || v_late || ' day' || case when v_late = 1 then '' else 's' end || ' late.',
                  'item', it.item_id, v_rec);
              end if;
              v_st := v_start;
            end if;
            if first_b is null then first_b := i; end if;
            if it.make_or_buy = 'MAKE' then
              insert into mfg_planned_orders (tenant_id, run_id, item_id, qty, start_date, finish_date, source, late_days)
              values (v_t, v_run, it.item_id, v_q, v_st, v_fin, 'MRP', v_late) returning id, document_number into v_id, v_no;
              b := mfg__bucket(v_st, v_start, p_bucket_days, nb);
              if b >= 0 then rel[b + 1] := rel[b + 1] + v_q; end if;
              v_bom := mfg_active_bom(v_t, it.item_id, v_st, 1);
              if v_bom is null then
                no_bom := true;
              else
                insert into mfg_mrp_demand (tenant_id, run_id, item_id, kind, source_id, source_ref, need_date, qty)
                select v_t, v_run, c.item_id, 'DEPENDENT', v_id, v_no, v_st, sum(c.qty)
                  from mfg__order_components(v_t, v_bom, v_q, v_st) c group by c.item_id having sum(c.qty) > 0.000001;
              end if;
            else
              insert into mfg_purchase_reqs (tenant_id, run_id, item_id, qty, need_date, order_by_date, late_days)
              values (v_t, v_run, it.item_id, v_q, v_rec, v_rec - v_lead, v_late);
              b := mfg__bucket(v_st, v_start, p_bucket_days, nb);
              if b >= 0 then rel[b + 1] := rel[b + 1] + v_q; end if;
            end if;
          end loop;
        end if;
        pend[i + 1] := v_proj;
      end loop;

      if no_bom then
        perform mfg__mrp_exc(v_t, v_run, it.item_id, 'NO_ACTIVE_BOM',
          it.item_name || ' is marked "Make" but has no active bill of materials, so its components could not be planned. Activate a bill of materials and run the plan again.',
          'item', it.item_id, null);
      end if;

      -- would the stock have lasted without the orders already on their way?
      pm := v_onhand; short_without := false;
      for i in 0..nb - 1 loop
        pm := pm - gross[i + 1];
        if pm < coalesce(it.safety_stock, 0) - 0.000001 then short_without := true; exit; end if;
      end loop;
      for r in select * from mfg__mrp_supply(v_t, it.item_id, v_start) loop
        b := mfg__bucket(r.dt, v_start, p_bucket_days, nb);
        if r.dt < v_start and r.kind <> 'PLANNED_ORDER' then
          perform mfg__mrp_exc(v_t, v_run, it.item_id, 'PAST_DUE_RECEIPT',
            it.item_name || ': ' || case r.kind when 'PURCHASE_ORDER' then 'purchase order ' else 'production order ' end || coalesce(r.ref, '') || ' (' || trim_scale(r.qty)::text || ' ' || it.base_uom ||
            ') was due on ' || to_char(r.dt, 'Mon DD') || ' and has not been received. Chase it or move its date.', r.kind, r.id, r.dt);
        elsif first_b is not null and (b < 0 or b > first_b) and r.dt >= v_start then
          perform mfg__mrp_exc(v_t, v_run, it.item_id, 'RESCHEDULE_IN',
            it.item_name || ': ' || coalesce(r.ref, '') || ' arrives on ' || to_char(r.dt, 'Mon DD') || ', but stock runs short from ' ||
            to_char(v_start + first_b * p_bucket_days, 'Mon DD') || '. Bring it forward if you can.', r.kind, r.id, r.dt);
        elsif first_b is null and not short_without and r.kind <> 'PLANNED_ORDER' then
          perform mfg__mrp_exc(v_t, v_run, it.item_id, 'NOT_NEEDED',
            it.item_name || ': ' || coalesce(r.ref, '') || ' (' || trim_scale(r.qty)::text || ' ' || it.base_uom || ') is not needed within the horizon — stock already covers every requirement. Consider postponing or cancelling it.',
            r.kind, r.id, r.dt);
        end if;
      end loop;

      insert into mfg_mrp_grid (run_id, tenant_id, item_id, bucket_no, bucket_start, projected_start, gross, scheduled, net, planned_receipt, planned_release, projected_end)
      select v_run, v_t, it.item_id, g - 1, v_start + (g - 1) * p_bucket_days, pstart[g], gross[g], sched[g], netq[g], rcpt[g], rel[g], pend[g]
        from generate_series(1, nb) g;

      -- who needs what: requirements matched first-come-first-served to the supply that covers them
      if has_dem then
        insert into mfg_pegging (tenant_id, run_id, item_id, demand_kind, demand_id, demand_ref, demand_date, supply_kind, supply_id, supply_ref, supply_date, qty)
        with d as (
          select dm.kind, dm.source_id, dm.source_ref, dm.need_date, dm.qty,
                 sum(dm.qty) over (order by dm.need_date, dm.id) as hi
            from mfg_mrp_demand dm where dm.run_id = v_run and dm.item_id = it.item_id),
        s as (
          select u.kind, u.sid, u.ref, u.dt, u.qty, sum(u.qty) over (order by u.dt, u.rk, u.sid) as hi
            from (
              select 'ONHAND'::text as kind, null::uuid as sid, 'On hand'::text as ref, v_start - 1 as dt, v_onhand as qty, 0 as rk where v_onhand > 0
              union all select sp.kind, sp.id, sp.ref, greatest(sp.dt, v_start), sp.qty, 1 from mfg__mrp_supply(v_t, it.item_id, v_start) sp
              union all select 'PLANNED_ORDER', po.id, po.document_number, po.finish_date, round(po.qty * (1 - v_scrap / 100), 6), 2
                          from mfg_planned_orders po where po.run_id = v_run and po.item_id = it.item_id and po.status = 'OPEN' and not po.firm
              union all select 'REQUISITION', rq.id, rq.document_number, rq.need_date, round(rq.qty * (1 - v_scrap / 100), 6), 2
                          from mfg_purchase_reqs rq where rq.run_id = v_run and rq.item_id = it.item_id and rq.status = 'OPEN'
            ) u)
        select v_t, v_run, it.item_id, d.kind, d.source_id, d.source_ref, d.need_date, s.kind, s.sid, s.ref, s.dt,
               round(least(d.hi, s.hi) - greatest(d.hi - d.qty, s.hi - s.qty), 6)
          from d join s on d.hi > s.hi - s.qty and d.hi - d.qty < s.hi
         where least(d.hi, s.hi) - greatest(d.hi - d.qty, s.hi - s.qty) > 0.000001;
      end if;
    end loop;
  end loop;

  select count(*) into n_pl from mfg_planned_orders where run_id = v_run;
  select count(*) into n_rq from mfg_purchase_reqs where run_id = v_run;
  select count(*) into n_ex from mfg_mrp_exceptions where run_id = v_run;
  update mfg_mrp_runs set status = 'DONE', finished_at = now(), items_planned = n_items, planned_orders = n_pl, requisitions = n_rq, exceptions = n_ex where id = v_run;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'mrp_run', jsonb_build_object('run', v_run, 'start', v_start, 'horizon_days', p_horizon_days, 'bucket_days', p_bucket_days,
                                              'items', n_items, 'planned_orders', n_pl, 'requisitions', n_rq, 'exceptions', n_ex), auth.uid());
  return v_run;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- planned orders you make yourself, and conversions ----------
create or replace function mfg_create_planned_order(p_item uuid, p_qty numeric, p_start date, p_finish date)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_id uuid;
begin
  if not exists (select 1 from items i join mfg_item_master m on m.item_id = i.id
                  where i.id = p_item and i.tenant_id = v_t and m.active and m.make_or_buy = 'MAKE') then
    raise exception 'Choose an item you make. Only items marked "Make" can have a planned order.';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Enter a quantity above zero.'; end if;
  if p_start is null or p_finish is null then raise exception 'Enter the start and finish dates.'; end if;
  if p_finish < p_start then raise exception 'The finish date can''t be before the start date.'; end if;
  insert into mfg_planned_orders (tenant_id, item_id, qty, start_date, finish_date, source, firm)
  values (v_t, p_item, p_qty, p_start, p_finish, 'MANUAL', true) returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_delete_planned_order(p_id uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  st text;
begin
  select status into st from mfg_planned_orders where id = p_id and tenant_id = v_t for update;
  if st is null then raise exception 'That planned order was not found.'; end if;
  if st <> 'OPEN' then raise exception 'Only an open planned order can be deleted (this one is %).', lower(st); end if;
  update mfg_planned_orders set status = 'DELETED' where id = p_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_delete_requisition(p_id uuid)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  st text;
begin
  select status into st from mfg_purchase_reqs where id = p_id and tenant_id = v_t for update;
  if st is null then raise exception 'That requisition was not found.'; end if;
  if st <> 'OPEN' then raise exception 'Only an open requisition can be deleted (this one is %).', lower(st); end if;
  update mfg_purchase_reqs set status = 'DELETED' where id = p_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_convert_planned_order(p_id uuid, p_backflush boolean default false)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  p mfg_planned_orders; v_order uuid; v_from date;
begin
  select * into p from mfg_planned_orders where id = p_id and tenant_id = v_t for update;
  if p.id is null then raise exception 'That planned order was not found.'; end if;
  if p.status <> 'OPEN' then raise exception 'This planned order is already %.', lower(p.status); end if;
  v_from := greatest(p.start_date, current_date);
  v_order := mfg_create_order(p.item_id, p.qty, v_from, greatest(p.finish_date, v_from), 1, 1, coalesce(p_backflush, false));
  update mfg_planned_orders set status = 'CONVERTED', converted_to_id = v_order where id = p_id;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'planned_order_converted', jsonb_build_object('planned', p_id, 'order', v_order), auth.uid());
  return v_order;
end;
$$ language plpgsql security definer set search_path = public;

-- p_lines: [{"req_id": …, "unit_price": 62}] — one purchase order for one vendor
create or replace function mfg_convert_requisitions(p_vendor uuid, p_lines jsonb)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  ln jsonb; rq mfg_purchase_reqs; v_lines jsonb := '[]'::jsonb; v_ids uuid[] := '{}'; v_po uuid; v_need date; n int := 0; price numeric;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Choose at least one requisition.'; end if;
  for ln in select * from jsonb_array_elements(p_lines) loop
    n := n + 1;
    select * into rq from mfg_purchase_reqs where id = nullif(ln->>'req_id', '')::uuid and tenant_id = v_t for update;
    if rq.id is null then raise exception 'Line %: that requisition was not found.', n; end if;
    if rq.status <> 'OPEN' then raise exception 'Line %: requisition % is already %.', n, rq.document_number, lower(rq.status); end if;
    if rq.id = any (v_ids) then raise exception 'Line %: requisition % is listed twice.', n, rq.document_number; end if;
    price := coalesce(nullif(ln->>'unit_price', '')::numeric, -1);
    if price < 0 then raise exception 'Line %: enter the price for requisition %.', n, rq.document_number; end if;
    v_ids := v_ids || rq.id;
    v_need := least(coalesce(v_need, rq.need_date), rq.need_date);
    v_lines := v_lines || jsonb_build_object('item_id', rq.item_id, 'qty', rq.qty, 'unit_price', price);
  end loop;
  v_po := mfg_create_po(p_vendor, current_date, v_need, v_lines);
  update mfg_purchase_reqs set status = 'CONVERTED', po_id = v_po where id = any (v_ids);
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'requisitions_converted', jsonb_build_object('po', v_po, 'requisitions', to_jsonb(v_ids)), auth.uid());
  return v_po;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg__bucket(date, date, int, int) from public, anon, authenticated;
revoke execute on function mfg__lot_qty(text, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke execute on function mfg__mrp_supply(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function mfg__mrp_exc(uuid, uuid, uuid, text, text, text, uuid, date) from public, anon, authenticated;
revoke execute on function mfg_save_forecast(uuid, date, numeric) from public, anon;
revoke execute on function mfg_run_mrp(int, int, boolean, date) from public, anon;
revoke execute on function mfg_create_planned_order(uuid, numeric, date, date) from public, anon;
revoke execute on function mfg_delete_planned_order(uuid) from public, anon;
revoke execute on function mfg_delete_requisition(uuid) from public, anon;
revoke execute on function mfg_convert_planned_order(uuid, boolean) from public, anon;
revoke execute on function mfg_convert_requisitions(uuid, jsonb) from public, anon;
grant execute on function mfg_save_forecast(uuid, date, numeric) to authenticated;
grant execute on function mfg_run_mrp(int, int, boolean, date) to authenticated;
grant execute on function mfg_create_planned_order(uuid, numeric, date, date) to authenticated;
grant execute on function mfg_delete_planned_order(uuid) to authenticated;
grant execute on function mfg_delete_requisition(uuid) to authenticated;
grant execute on function mfg_convert_planned_order(uuid, boolean) to authenticated;
grant execute on function mfg_convert_requisitions(uuid, jsonb) to authenticated;
