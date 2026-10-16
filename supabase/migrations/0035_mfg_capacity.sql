-- ============================================================
-- Classroom ERP — migration 0035 (Manufacturing ERP, Phase 5b: capacity check, collective conversion, rescheduling)
--
-- Needs 0023–0034. ADDITIVE ONLY: five new functions, no new table, nothing existing redefined. No Standard object is touched.
--
--   mfg_capacity_load      How many hours of work each work centre is asked to do in each time column, against the hours it has.
--                            Work comes from open production orders (what is left of each operation) and from open planned orders
--                            (the item's active routing, first alternative). It is spread evenly over the WORKING days between
--                            the order's start and finish, using the work centre's shifts, hours per shift, utilisation and working
--                            weekdays, and skipping the company holidays. Work that is already late is placed from the first
--                            day shown; an order whose whole span has no working day is put on its first day, so it shows up as
--                            load instead of disappearing. This is an infinite-capacity MRP with a capacity CHECK (like SAP CM01):
--                            overload is shown, never fixed automatically.
--   mfg_capacity_orders    Which orders make up that load for one work centre.
--   mfg_convert_planned_orders   Several planned orders become production orders in one step (all or nothing).
--   mfg_reschedule_planned_order / mfg_reschedule_order   Move the dates of a planned order (it becomes firm, so the next planning
--                            run keeps the new dates) or of a production order that has not started.
--
-- Not changed: the MRP run still counts calendar days for lead times; the work-centre calendar is used for capacity only.
--
-- ROLLBACK (drops only what this file created):
--   drop function if exists mfg_reschedule_order(uuid, date, date), mfg_reschedule_planned_order(uuid, date, date),
--     mfg_convert_planned_orders(uuid[], boolean), mfg_capacity_orders(uuid, uuid, date, int), mfg_capacity_load(uuid, date, int, int);
-- ============================================================

create or replace function mfg_capacity_load(p_tenant uuid, p_from date, p_days int, p_bucket int default 7)
returns table (work_center_id uuid, bucket_no int, bucket_start date, available_h numeric, open_h numeric, planned_h numeric, required_h numeric, load_pct numeric) as $$
declare
  nb int; v_end date;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null then raise exception 'Choose the date to start from.'; end if;
  if p_bucket is null or p_bucket not in (1, 7, 14, 30) then raise exception 'Choose a column of 1, 7, 14 or 30 days.'; end if;
  if p_days is null or p_days < 7 or p_days > 365 then raise exception 'Look ahead between 7 and 365 days.'; end if;
  nb := ceil(p_days::numeric / p_bucket)::int;
  if nb > 60 then raise exception 'That is % columns. Use longer columns or look less far ahead (60 at most).', nb; end if;
  v_end := p_from + nb * p_bucket;
  return query
  with wc as (
    select w.id, w.shifts * w.hours_per_shift * w.utilization_pct / 100 as cap, w.working_days
      from mfg_work_centers w where w.tenant_id = p_tenant and w.active),
  work as (
    select row_number() over () as wid, x.* from (
      select op.work_center_id as wcid, 'open'::text as kind,
             (case when op.qty_confirmed <= 0 then op.setup_min else 0 end
              + op.run_min_per_unit * greatest(o.qty_planned - op.qty_confirmed, 0)
              + case when o.qty_planned - op.qty_confirmed > 0 then op.teardown_min else 0 end) as minutes,
             greatest(coalesce(o.planned_start, p_from), p_from) as s,
             greatest(coalesce(o.planned_end, o.planned_start, p_from), greatest(coalesce(o.planned_start, p_from), p_from)) as e
        from mfg_prod_operations op
        join mfg_production_orders o on o.id = op.order_id
       where op.tenant_id = p_tenant and op.work_center_id is not null
         and o.status in ('CREATED', 'PENDING_APPROVAL', 'RELEASED', 'PARTIALLY_CONFIRMED')
      union all
      select ro.work_center_id, 'planned'::text,
             ro.setup_min + ro.run_min_per_unit * po.qty + ro.teardown_min,
             greatest(po.start_date, p_from),
             greatest(po.finish_date, greatest(po.start_date, p_from))
        from mfg_planned_orders po
        join mfg_routings r on r.tenant_id = p_tenant and r.item_id = po.item_id and r.alt_no = 1 and r.status = 'ACTIVE'
        join mfg_routing_ops ro on ro.routing_id = r.id
       where po.tenant_id = p_tenant and po.status = 'OPEN' and ro.work_center_id is not null
    ) x where x.minutes > 0),
  spread as (
    select w.wid, w.wcid, w.kind, w.minutes, g::date as d, count(*) over (partition by w.wid) as n
      from work w
      join wc on wc.id = w.wcid
      cross join lateral generate_series(w.s, w.e, interval '1 day') g
     where extract(isodow from g)::int = any (wc.working_days)
       and not exists (select 1 from mfg_holidays h where h.tenant_id = p_tenant and h.holiday_date = g::date)),
  fallback as (
    select w.wid, w.wcid, w.kind, w.minutes, w.s as d, 1::bigint as n
      from work w where not exists (select 1 from spread sp where sp.wid = w.wid)),
  allocated as (
    select s1.kind, s1.wcid, s1.d, s1.minutes / s1.n / 60.0 as h from spread s1
    union all
    select f.kind, f.wcid, f.d, f.minutes / f.n / 60.0 from fallback f),
  wload as (
    select a.wcid, (a.d - p_from) / p_bucket as b,
           sum(a.h) filter (where a.kind = 'open') as open_h, sum(a.h) filter (where a.kind = 'planned') as planned_h
      from allocated a where a.d >= p_from and a.d < v_end group by 1, 2),
  avail as (
    select wc.id as wcid, (g::date - p_from) / p_bucket as b, sum(wc.cap) as h
      from wc
      cross join generate_series(p_from, v_end - 1, interval '1 day') g
     where extract(isodow from g)::int = any (wc.working_days)
       and not exists (select 1 from mfg_holidays h where h.tenant_id = p_tenant and h.holiday_date = g::date)
     group by 1, 2)
  select wc.id, n.b, p_from + n.b * p_bucket,
         round(coalesce(av.h, 0), 2),
         round(coalesce(l.open_h, 0), 2),
         round(coalesce(l.planned_h, 0), 2),
         round(coalesce(l.open_h, 0) + coalesce(l.planned_h, 0), 2),
         case when coalesce(av.h, 0) > 0 then round((coalesce(l.open_h, 0) + coalesce(l.planned_h, 0)) / av.h * 100, 1) end
    from wc
    cross join generate_series(0, nb - 1) n(b)
    left join wload l on l.wcid = wc.id and l.b = n.b
    left join avail av on av.wcid = wc.id and av.b = n.b
   order by wc.id, n.b;
end;
$$ language plpgsql stable security definer set search_path = public;

-- The orders behind one work centre's load: hours still to do, and the span they are spread over.
create or replace function mfg_capacity_orders(p_tenant uuid, p_work_center uuid, p_from date, p_days int)
returns table (kind text, doc_no text, item_id uuid, source_id uuid, hours numeric, start_date date, finish_date date) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  return query
  select 'open'::text, o.document_number, o.item_id, o.id,
         round(sum(case when op.qty_confirmed <= 0 then op.setup_min else 0 end
                   + op.run_min_per_unit * greatest(o.qty_planned - op.qty_confirmed, 0)
                   + case when o.qty_planned - op.qty_confirmed > 0 then op.teardown_min else 0 end) / 60.0, 2),
         greatest(coalesce(o.planned_start, p_from), p_from),
         greatest(coalesce(o.planned_end, o.planned_start, p_from), greatest(coalesce(o.planned_start, p_from), p_from))
    from mfg_prod_operations op
    join mfg_production_orders o on o.id = op.order_id
   where op.tenant_id = p_tenant and op.work_center_id = p_work_center
     and o.status in ('CREATED', 'PENDING_APPROVAL', 'RELEASED', 'PARTIALLY_CONFIRMED')
   group by o.id, o.document_number, o.item_id, o.planned_start, o.planned_end
  having sum(case when op.qty_confirmed <= 0 then op.setup_min else 0 end
             + op.run_min_per_unit * greatest(o.qty_planned - op.qty_confirmed, 0)
             + case when o.qty_planned - op.qty_confirmed > 0 then op.teardown_min else 0 end) > 0
  union all
  select 'planned'::text, po.document_number, po.item_id, po.id,
         round(sum(ro.setup_min + ro.run_min_per_unit * po.qty + ro.teardown_min) / 60.0, 2),
         greatest(po.start_date, p_from), greatest(po.finish_date, greatest(po.start_date, p_from))
    from mfg_planned_orders po
    join mfg_routings r on r.tenant_id = p_tenant and r.item_id = po.item_id and r.alt_no = 1 and r.status = 'ACTIVE'
    join mfg_routing_ops ro on ro.routing_id = r.id
   where po.tenant_id = p_tenant and po.status = 'OPEN' and ro.work_center_id = p_work_center
   group by po.id, po.document_number, po.item_id, po.start_date, po.finish_date
  order by 6, 2;
end;
$$ language plpgsql stable security definer set search_path = public;

-- Several planned orders at once: all of them become production orders, or none does.
create or replace function mfg_convert_planned_orders(p_ids uuid[], p_backflush boolean default false)
returns uuid[] as $$
declare
  v_t uuid := mfg__my_tenant();
  x uuid; out_ids uuid[] := '{}';
begin
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Choose at least one planned order.'; end if;
  if cardinality(p_ids) > 100 then raise exception 'Convert at most 100 planned orders at a time.'; end if;
  if (select count(distinct i) from unnest(p_ids) i) <> cardinality(p_ids) then raise exception 'The same planned order is listed twice.'; end if;
  foreach x in array p_ids loop
    out_ids := out_ids || mfg_convert_planned_order(x, p_backflush);
  end loop;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'planned_orders_converted', jsonb_build_object('count', cardinality(p_ids), 'orders', to_jsonb(out_ids)), auth.uid());
  return out_ids;
end;
$$ language plpgsql security definer set search_path = public;

-- Move a planned order. It becomes firm: the next planning run keeps the dates you chose.
create or replace function mfg_reschedule_planned_order(p_id uuid, p_start date, p_finish date)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  st text;
begin
  if p_start is null or p_finish is null then raise exception 'Enter the start and finish dates.'; end if;
  if p_finish < p_start then raise exception 'The finish date can''t be before the start date.'; end if;
  select status into st from mfg_planned_orders where id = p_id and tenant_id = v_t for update;
  if st is null then raise exception 'That planned order was not found.'; end if;
  if st <> 'OPEN' then raise exception 'Only an open planned order can be moved (this one is %).', lower(st); end if;
  update mfg_planned_orders set start_date = p_start, finish_date = p_finish, firm = true, late_days = 0 where id = p_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Move a production order that has not started (nothing issued or confirmed yet).
create or replace function mfg_reschedule_order(p_order uuid, p_start date, p_end date)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  st text; no text;
begin
  if p_start is null or p_end is null then raise exception 'Enter the start and finish dates.'; end if;
  if p_end < p_start then raise exception 'The finish date can''t be before the start date.'; end if;
  select status, document_number into st, no from mfg_production_orders where id = p_order and tenant_id = v_t for update;
  if st is null then raise exception 'That production order was not found.'; end if;
  if st not in ('CREATED', 'PENDING_APPROVAL', 'RELEASED') then
    raise exception 'Only an order that has not started can be moved (this one is %).', lower(replace(st, '_', ' '));
  end if;
  update mfg_production_orders set planned_start = p_start, planned_end = p_end where id = p_order;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'order_rescheduled', jsonb_build_object('order', p_order, 'number', no, 'start', p_start, 'end', p_end), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function mfg_capacity_load(uuid, date, int, int) from public, anon;
revoke execute on function mfg_capacity_orders(uuid, uuid, date, int) from public, anon;
revoke execute on function mfg_convert_planned_orders(uuid[], boolean) from public, anon;
revoke execute on function mfg_reschedule_planned_order(uuid, date, date) from public, anon;
revoke execute on function mfg_reschedule_order(uuid, date, date) from public, anon;
grant execute on function mfg_capacity_load(uuid, date, int, int) to authenticated;
grant execute on function mfg_capacity_orders(uuid, uuid, date, int) to authenticated;
grant execute on function mfg_convert_planned_orders(uuid[], boolean) to authenticated;
grant execute on function mfg_reschedule_planned_order(uuid, date, date) to authenticated;
grant execute on function mfg_reschedule_order(uuid, date, date) to authenticated;
