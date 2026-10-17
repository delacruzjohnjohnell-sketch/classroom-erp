-- ============================================================
-- Classroom ERP — migration 0037 (Manufacturing ERP, Phase 6b: shop-floor dispatch list and OEE)
--
-- Needs 0023–0036. ADDITIVE ONLY: two new tables and five new functions. Nothing existing is changed or redefined.
--
--   Dispatch list (mfg_dispatch_list)   For each work centre, the operations of released orders that still have work to do, in the order
--                                       they should be run: by the order's priority (1 = most urgent, 5 when none is set), then the
--                                       earliest due date, then start date, order number and operation. For each: how many units are
--                                       READY (the previous operation has finished that many more than this one has done; the first
--                                       operation is ready for everything left), the hours still to work, and whether the order is late.
--                                       mfg_set_order_priority sets an order's priority.
--   Downtime (mfg_log_downtime)         Hours a work centre stood still on a day, with a reason. PLANNED_STOP (breaks, planned
--                                       maintenance) is taken off the planned time; every other reason counts against availability.
--                                       Entries are never edited: a mistake is voided with a reason (mfg_void_downtime).
--   OEE (mfg_oee)                       Overall equipment effectiveness per work centre and time column, from confirmations and downtime:
--                                         planned time       scheduled hours (shifts × hours per shift, on working days, less holidays)
--                                                            less planned stops
--                                         availability       (planned time − downtime − set-up hours) ÷ planned time
--                                         performance        ideal hours ÷ machine hours actually run; ideal = units made (good + scrap)
--                                                            × the operation's machine minutes per unit (run minutes if none)
--                                         quality            good units ÷ (good + scrap)
--                                         OEE                availability × performance × quality
--                                       The function returns the hours and counts; the ratios are worked out on the screen so that
--                                       several columns can be added together first. A reversed confirmation takes its hours and units
--                                       back out. Confirmations on orders without a routing cannot be placed at a work centre and are
--                                       left out. Idle time with no work scheduled is not a loss here (only logged downtime and set-up are).
--
-- ROLLBACK (drops only what this file created):
--   drop function if exists mfg_oee(uuid, date, int, int), mfg_dispatch_list(uuid, uuid), mfg_set_order_priority(uuid, int),
--     mfg_void_downtime(uuid, text), mfg_log_downtime(uuid, date, numeric, text, text);
--   drop table if exists mfg_order_priority, mfg_downtime;
-- ============================================================

-- ---------- tables ----------
create table if not exists mfg_downtime (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  work_center_id uuid not null references mfg_work_centers(id) on delete cascade,
  event_date     date not null,
  hours          numeric(8, 2) not null check (hours > 0 and hours <= 24),
  category       text not null check (category in ('BREAKDOWN', 'NO_MATERIAL', 'NO_OPERATOR', 'OTHER', 'PLANNED_STOP')),
  note           text,
  voided_at      timestamptz,
  voided_by      uuid,
  void_reason    text,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists mfg_downtime_idx on mfg_downtime (tenant_id, work_center_id, event_date);

create table if not exists mfg_order_priority (
  order_id   uuid primary key references mfg_production_orders(id) on delete cascade,
  tenant_id  uuid not null references tenants(id) on delete cascade,
  priority   smallint not null check (priority between 1 and 9),
  updated_at timestamptz not null default now()
);
create index if not exists mfg_order_priority_idx on mfg_order_priority (tenant_id);

-- ---------- security: read by the owning company and the teacher; writes only through the functions below ----------
alter table mfg_downtime enable row level security;
alter table mfg_order_priority enable row level security;
do $$
declare t text;
begin
  foreach t in array array['mfg_downtime', 'mfg_order_priority'] loop
    execute format('drop policy if exists "mfg read" on %I', t);
    execute format($f$create policy "mfg read" on %I for select
      using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING')$f$, t);
  end loop;
end $$;

-- ---------- downtime ----------
create or replace function mfg_log_downtime(p_wc uuid, p_date date, p_hours numeric, p_category text, p_note text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_id uuid; v_day numeric;
begin
  if not exists (select 1 from mfg_work_centers where id = p_wc and tenant_id = v_t) then raise exception 'Choose a work centre from your company.'; end if;
  if p_date is null then raise exception 'Choose the day.'; end if;
  if p_hours is null or p_hours <= 0 then raise exception 'Enter how many hours it stood still (above zero).'; end if;
  if p_hours > 24 then raise exception 'A day only has 24 hours.'; end if;
  if p_category is null or p_category not in ('BREAKDOWN', 'NO_MATERIAL', 'NO_OPERATOR', 'OTHER', 'PLANNED_STOP') then raise exception 'Choose the reason.'; end if;
  select coalesce(sum(hours), 0) into v_day from mfg_downtime where work_center_id = p_wc and event_date = p_date and voided_at is null;
  if v_day + p_hours > 24 then raise exception 'That would be % hours of downtime on one day; a day only has 24.', trim_scale(v_day + p_hours); end if;
  insert into mfg_downtime (tenant_id, work_center_id, event_date, hours, category, note)
  values (v_t, p_wc, p_date, round(p_hours, 2), p_category, nullif(trim(coalesce(p_note, '')), '')) returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_void_downtime(p_id uuid, p_reason text)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  d mfg_downtime;
begin
  select * into d from mfg_downtime where id = p_id and tenant_id = v_t for update;
  if d.id is null then raise exception 'That downtime entry was not found.'; end if;
  if d.voided_at is not null then raise exception 'That entry is already voided.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are voiding it — the reason stays on the record.'; end if;
  update mfg_downtime set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- priority ----------
create or replace function mfg_set_order_priority(p_order uuid, p_priority int)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  st text;
begin
  select status into st from mfg_production_orders where id = p_order and tenant_id = v_t;
  if st is null then raise exception 'That production order was not found.'; end if;
  if st in ('CLOSED', 'CANCELLED') then raise exception 'A % order has nothing left to schedule.', lower(st); end if;
  if p_priority is null or p_priority < 1 or p_priority > 9 then raise exception 'Priority is a number from 1 (most urgent) to 9.'; end if;
  insert into mfg_order_priority (order_id, tenant_id, priority) values (p_order, v_t, p_priority)
  on conflict (order_id) do update set priority = excluded.priority, updated_at = now();
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the dispatch list ----------
create or replace function mfg_dispatch_list(p_tenant uuid, p_work_center uuid default null)
returns table (work_center_id uuid, order_id uuid, order_no text, item_id uuid, op_no int, description text, priority int,
               planned_start date, planned_end date, qty_planned numeric, qty_done numeric, qty_ready numeric, remaining_h numeric,
               status text, late boolean, previous_op int) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  return query
  select op.work_center_id, o.id, o.document_number, o.item_id, op.op_no, op.description, coalesce(pr.priority, 5)::int,
         o.planned_start, o.planned_end, o.qty_planned, op.qty_confirmed,
         case when prev.op_no is null then greatest(o.qty_planned - op.qty_confirmed, 0) else greatest(prev.qty_confirmed - op.qty_confirmed, 0) end,
         round((case when op.qty_confirmed <= 0 then op.setup_min else 0 end
                + op.run_min_per_unit * greatest(o.qty_planned - op.qty_confirmed, 0)
                + case when o.qty_planned - op.qty_confirmed > 0 then op.teardown_min else 0 end) / 60.0, 2),
         o.status, coalesce(o.planned_end < current_date, false), prev.op_no
    from mfg_prod_operations op
    join mfg_production_orders o on o.id = op.order_id
    left join mfg_order_priority pr on pr.order_id = o.id
    left join lateral (select p2.op_no, p2.qty_confirmed from mfg_prod_operations p2
                        where p2.order_id = op.order_id and p2.op_no < op.op_no order by p2.op_no desc limit 1) prev on true
   where op.tenant_id = p_tenant and op.work_center_id is not null
     and o.status in ('RELEASED', 'PARTIALLY_CONFIRMED')
     and o.qty_planned - op.qty_confirmed > 0.000001
     and (p_work_center is null or op.work_center_id = p_work_center)
   order by coalesce(pr.priority, 5), o.planned_end nulls last, o.planned_start nulls last, o.document_number, op.op_no;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- OEE ----------
create or replace function mfg_oee(p_tenant uuid, p_from date, p_days int, p_bucket int default 7)
returns table (work_center_id uuid, bucket_no int, bucket_start date, scheduled_h numeric, planned_stop_h numeric, planned_h numeric, downtime_h numeric,
               setup_h numeric, run_h numeric, ideal_h numeric, good_qty numeric, scrap_qty numeric) as $$
declare
  nb int; v_end date;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null then raise exception 'Choose the date to start from.'; end if;
  if p_bucket is null or p_bucket not in (1, 7, 14, 30) then raise exception 'Choose a column of 1, 7, 14 or 30 days.'; end if;
  if p_days is null or p_days < 7 or p_days > 365 then raise exception 'Look back between 7 and 365 days.'; end if;
  nb := ceil(p_days::numeric / p_bucket)::int;
  if nb > 60 then raise exception 'That is % columns. Use longer columns or look at a shorter period (60 at most).', nb; end if;
  v_end := p_from + nb * p_bucket;
  return query
  with wc as (
    select w.id, w.shifts * w.hours_per_shift as day_h, w.working_days from mfg_work_centers w where w.tenant_id = p_tenant and w.active),
  sched as (
    select wc.id as wcid, (g::date - p_from) / p_bucket as b, sum(wc.day_h) as h
      from wc cross join generate_series(p_from, v_end - 1, interval '1 day') g
     where extract(isodow from g)::int = any (wc.working_days)
       and not exists (select 1 from mfg_holidays h where h.tenant_id = p_tenant and h.holiday_date = g::date)
     group by 1, 2),
  dt as (
    select d.work_center_id as wcid, (d.event_date - p_from) / p_bucket as b,
           sum(d.hours) filter (where d.category = 'PLANNED_STOP') as ps, sum(d.hours) filter (where d.category <> 'PLANNED_STOP') as down
      from mfg_downtime d
     where d.tenant_id = p_tenant and d.voided_at is null and d.event_date >= p_from and d.event_date < v_end
     group by 1, 2),
  cf as (
    select op.work_center_id as wcid, (c.posting_date - p_from) / p_bucket as b,
           sum(c.setup_h) as sh, sum(c.machine_h) as mh, sum(c.yield_qty) as y, sum(c.scrap_qty) as s,
           sum((c.yield_qty + c.scrap_qty) * (case when op.machine_min_per_unit > 0 then op.machine_min_per_unit else op.run_min_per_unit end) / 60.0) as ideal
      from mfg_confirmations c
      join mfg_prod_operations op on op.order_id = c.order_id and op.op_no = c.op_no
     where c.tenant_id = p_tenant and c.op_no is not null and op.work_center_id is not null
       and c.posting_date >= p_from and c.posting_date < v_end
     group by 1, 2)
  select wc.id, n.b, p_from + n.b * p_bucket,
         round(coalesce(sc.h, 0), 2),
         round(coalesce(dt.ps, 0), 2),
         round(greatest(coalesce(sc.h, 0) - coalesce(dt.ps, 0), 0), 2),
         round(coalesce(dt.down, 0), 2),
         round(coalesce(cf.sh, 0), 2),
         round(coalesce(cf.mh, 0), 2),
         round(coalesce(cf.ideal, 0), 2),
         round(coalesce(cf.y, 0), 4),
         round(coalesce(cf.s, 0), 4)
    from wc
    cross join generate_series(0, nb - 1) n(b)
    left join sched sc on sc.wcid = wc.id and sc.b = n.b
    left join dt on dt.wcid = wc.id and dt.b = n.b
    left join cf on cf.wcid = wc.id and cf.b = n.b
   order by wc.id, n.b;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg_log_downtime(uuid, date, numeric, text, text) from public, anon;
revoke execute on function mfg_void_downtime(uuid, text) from public, anon;
revoke execute on function mfg_set_order_priority(uuid, int) from public, anon;
revoke execute on function mfg_dispatch_list(uuid, uuid) from public, anon;
revoke execute on function mfg_oee(uuid, date, int, int) from public, anon;
grant execute on function mfg_log_downtime(uuid, date, numeric, text, text) to authenticated;
grant execute on function mfg_void_downtime(uuid, text) to authenticated;
grant execute on function mfg_set_order_priority(uuid, int) to authenticated;
grant execute on function mfg_dispatch_list(uuid, uuid) to authenticated;
grant execute on function mfg_oee(uuid, date, int, int) to authenticated;
