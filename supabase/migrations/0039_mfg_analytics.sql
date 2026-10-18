-- ============================================================
-- Classroom ERP — migration 0039 (Manufacturing ERP, Phase 7b: analytics and the class comparison)
--
-- Needs 0023–0038. ADDITIVE ONLY: new functions, no new tables. One Manufacturing-only function of our own is redefined with the same
-- signature (mfg_period_checks, from 0038, see the end). Nothing Standard is changed.
-- Every function reads one Manufacturing company (the owner or the teacher may ask) except the class comparison, which is the teacher's.
--
--   mfg_profitability       Per product, in a date range: units delivered, revenue (delivered units × the sales order price), cost of
--                           goods sold (the cost on the delivery documents), margin and margin %. Reversed deliveries net out.
--   mfg_variance_trend      Per month and per kind of variance (purchase price, material usage, labor efficiency, labor rate, machine
--                           overhead, fixed overhead, scrap and rework loss, lot size / mix): what ARISE that month. The month-end entries
--                           that close the variances to cost of goods sold or inventory are left out, so the figures do not vanish when a
--                           month is settled. Positive = unfavourable (a cost).
--   mfg_inventory_analysis  Per stocked item: quantity, cost, value, units used in the last N days (issued to production or delivered),
--                           days of cover, and an ABC class by value (A = the items that make up the first 80 % of the value, B the next
--                           15 %, C the rest).
--   mfg_supplier_performance Per vendor in a date range: purchase orders and units ordered, units received, goods-receipt lines on time and
--                           late (against the PO's expected date), average days late, purchase price variance (units × (PO price − cost
--                           booked)), and units rejected at inspection (scrapped or returned).
--   mfg_production_kpis     Per product, for orders whose final confirmation falls in a date range: orders, good and scrap units,
--                           scrap %, orders on time and late (final confirmation against the planned end), average lead days (planned
--                           start to final confirmation), standard unit cost against the actual cost per good unit.
--   mfg_lot_size_curve      Cost per unit of one product at several lot sizes, split into material, labor, machine, variable and
--                           fixed overhead, using the same cost engine as a cost estimate. It writes nothing: each estimate is made inside
--                           a sub-transaction that is rolled back. Set-up time spread over a bigger lot is why the unit cost falls.
--   mfg_class_comparison    Teacher only. One row per Manufacturing company: owner, costing method, revenue, cost of goods sold, margin,
--                           inventory value, orders made, good units, scrap %, variances that arose, months closed, whether the books
--                           check ties, last activity.
--
-- ROLLBACK (drops only what this file created; then re-run 0038 to restore mfg_period_checks):
--   drop function if exists mfg_class_comparison(), mfg_lot_size_curve(uuid, numeric[], date), mfg_production_kpis(uuid, date, date),
--     mfg_supplier_performance(uuid, date, date), mfg_inventory_analysis(uuid, int), mfg_variance_trend(uuid, date, int),
--     mfg_profitability(uuid, date, date), mfg__variance_net(uuid), mfg__var_map(uuid);
-- ============================================================

-- ---------- helpers (internal) ----------
-- Which account is which kind of variance. A company that maps two keys to one account is counted once.
create or replace function mfg__var_map(p_tenant uuid)
returns table (account_id uuid, bucket text) as $$
  select distinct on (d.account_id) d.account_id,
         case d.key when 'PPV' then 'PPV' when 'MATERIAL_USAGE_VAR' then 'MATERIAL' when 'LABOR_EFF_VAR' then 'LABOR_EFF'
                    when 'LABOR_RATE_VAR' then 'LABOR_RATE' when 'MACHINE_OH_VAR' then 'MACHINE_OH' when 'FIXED_OH_VAR' then 'FIXED_OH'
                    when 'SCRAP_LOSS' then 'SCRAP' when 'LOT_SIZE_VAR' then 'LOT_MIX' end
    from mfg_account_determination d
   where d.tenant_id = p_tenant
     and d.key in ('PPV', 'MATERIAL_USAGE_VAR', 'LABOR_EFF_VAR', 'LABOR_RATE_VAR', 'MACHINE_OH_VAR', 'FIXED_OH_VAR', 'SCRAP_LOSS', 'LOT_SIZE_VAR')
   order by d.account_id, d.key;
$$ language sql stable security definer set search_path = public;

-- The journal lines of the variance accounts, without the month-end entries that close them (and their reversals).
create or replace function mfg__variance_net(p_tenant uuid)
returns numeric as $$
  select coalesce(sum(jl.debit - jl.credit), 0)
    from journal_lines jl join journal_entries je on je.id = jl.journal_entry_id join mfg__var_map(p_tenant) vm on vm.account_id = jl.account_id
   where je.tenant_id = p_tenant
     and not (je.source_table = 'mfg_periods' and (je.memo like '%variances closed' or je.memo like 'Reversal of month end%(variances)'));
$$ language sql stable security definer set search_path = public;

-- ---------- profitability ----------
create or replace function mfg_profitability(p_tenant uuid, p_from date, p_to date)
returns table (item_id uuid, delivered_qty numeric, revenue numeric, cost numeric, margin numeric, margin_pct numeric) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose the dates to report on.'; end if;
  return query
  select q.item_id, round(q.qty, 4), round(q.rev, 2), round(q.cst, 2), round(q.rev - q.cst, 2),
         case when q.rev <> 0 then round((q.rev - q.cst) / q.rev * 100, 1) end
    from (select dl.item_id, sum(-dl.qty_change) as qty, sum(-dl.qty_change * sl.unit_price) as rev, sum(-dl.total_cost) as cst
            from mfg_material_doc_lines dl
            join mfg_material_documents d on d.id = dl.doc_id
            join sales_order_lines sl on sl.id = dl.so_line_id
           where dl.tenant_id = p_tenant and d.posting_date between p_from and p_to
           group by dl.item_id) q
   order by q.rev - q.cst desc;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- variance trend ----------
create or replace function mfg_variance_trend(p_tenant uuid, p_end date, p_months int default 6)
returns table (month_start date, bucket text, amount numeric) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_end is null then raise exception 'Choose the month to end with.'; end if;
  if p_months is null or p_months < 1 or p_months > 24 then raise exception 'Look back between 1 and 24 months.'; end if;
  return query
  with months as (
    select (date_trunc('month', p_end) - (n::text || ' months')::interval)::date as m from generate_series(0, p_months - 1) n
  ), buckets as (
    select distinct vm.bucket as b from mfg__var_map(p_tenant) vm
  ), amt as (
    select date_trunc('month', je.entry_date)::date as m, vm.bucket as b, sum(jl.debit - jl.credit) as a
      from journal_lines jl join journal_entries je on je.id = jl.journal_entry_id join mfg__var_map(p_tenant) vm on vm.account_id = jl.account_id
     where je.tenant_id = p_tenant and je.entry_date >= (select min(m) from months) and je.entry_date <= p_end
       and not (je.source_table = 'mfg_periods' and (je.memo like '%variances closed' or je.memo like 'Reversal of month end%(variances)'))
     group by 1, 2
  )
  select months.m, buckets.b, round(coalesce(amt.a, 0), 2)
    from months cross join buckets left join amt on amt.m = months.m and amt.b = buckets.b
   order by months.m, buckets.b;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- inventory: value, cover and ABC ----------
create or replace function mfg_inventory_analysis(p_tenant uuid, p_days int default 90)
returns table (item_id uuid, item_type text, qty numeric, unit_cost numeric, value numeric, used_qty numeric, days_cover numeric, abc text, cum_pct numeric) as $$
declare
  v_method text;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_days is null or p_days < 7 or p_days > 365 then raise exception 'Look back between 7 and 365 days.'; end if;
  select costing_method into v_method from mfg_company_settings where tenant_id = p_tenant;
  return query
  with st as (
    select s.item_id as iid, sum(s.qty) as q from mfg_stock s where s.tenant_id = p_tenant group by 1
  ), used as (
    select dl.item_id as iid, sum(-dl.qty_change) as q
      from mfg_material_doc_lines dl
      join mfg_material_documents d on d.id = dl.doc_id
      left join mfg_material_documents o on o.id = d.reversal_of
     where dl.tenant_id = p_tenant and d.posting_date > current_date - p_days
       and coalesce(case when d.doc_type = 'REV' then o.doc_type else d.doc_type end, '') in ('GI', 'DLV')
     group by 1
  ), base as (
    select m.item_id as iid, m.item_type as ity, coalesce(st.q, 0) as q,
           case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end as uc, coalesce(u.q, 0) as uq
      from mfg_item_master m left join st on st.iid = m.item_id left join used u on u.iid = m.item_id
     where m.tenant_id = p_tenant and m.item_type <> 'SERVICE' and (coalesce(st.q, 0) <> 0 or coalesce(u.q, 0) <> 0)
  ), ranked as (
    select b.*, round(b.q * b.uc, 2) as val,
           sum(round(b.q * b.uc, 2)) over () as tot,
           sum(round(b.q * b.uc, 2)) over (order by round(b.q * b.uc, 2) desc, b.iid) as run
      from base b
  )
  select r.iid, r.ity, round(r.q, 4), r.uc, r.val, round(r.uq, 4),
         case when r.uq > 0 then round(r.q / (r.uq / p_days), 1) end,
         (case when r.tot <= 0 or r.val <= 0 then 'C' when (r.run - r.val) / r.tot < 0.8 then 'A' when (r.run - r.val) / r.tot < 0.95 then 'B' else 'C' end)::text,
         case when r.tot > 0 then round(r.run / r.tot * 100, 1) end
    from ranked r
   order by r.val desc, r.iid;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- suppliers ----------
create or replace function mfg_supplier_performance(p_tenant uuid, p_from date, p_to date)
returns table (vendor_id uuid, vendor_name text, po_count int, qty_ordered numeric, qty_received numeric, lines_on_time int, lines_late int,
               avg_days_late numeric, ppv numeric, rejected_qty numeric) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose the dates to report on.'; end if;
  return query
  with ord as (
    select po.vendor_id as vid, count(distinct po.id)::int as pos, sum(pl.qty) as q
      from purchase_orders po join purchase_order_lines pl on pl.purchase_order_id = po.id
     where po.tenant_id = p_tenant and po.order_date between p_from and p_to group by 1
  ), gr as (
    select po.vendor_id as vid, dl.id as line_id, d.doc_type as dt, d.posting_date as pd, po.expected_date as exp, dl.qty_change as q,
           dl.qty_change * (pl.unit_cost - dl.unit_cost) as var
      from mfg_material_doc_lines dl
      join mfg_material_documents d on d.id = dl.doc_id
      join purchase_order_lines pl on pl.id = dl.po_line_id
      join purchase_orders po on po.id = pl.purchase_order_id
     where dl.tenant_id = p_tenant and d.posting_date between p_from and p_to
  ), rc as (
    select g.vid,
           sum(g.q) as received,
           count(*) filter (where g.dt = 'GR' and (g.exp is null or g.pd <= g.exp))::int as on_time,
           count(*) filter (where g.dt = 'GR' and g.exp is not null and g.pd > g.exp)::int as late,
           avg((g.pd - g.exp)::numeric) filter (where g.dt = 'GR' and g.exp is not null and g.pd > g.exp) as dl,
           sum(g.var) as ppv
      from gr g group by 1
  ), rj as (
    select g.vid, sum(l.qty_scrap + l.qty_return) as rej
      from mfg_inspection_lots l join gr g on g.line_id = l.source_line_id
     where l.tenant_id = p_tenant and l.status = 'DECIDED' and l.source = 'GR' group by 1
  )
  select v.id, v.name, coalesce(o.pos, 0), round(coalesce(o.q, 0), 4), round(coalesce(r.received, 0), 4), coalesce(r.on_time, 0), coalesce(r.late, 0),
         round(r.dl, 1), round(coalesce(r.ppv, 0), 2), round(coalesce(j.rej, 0), 4)
    from vendors v
    left join ord o on o.vid = v.id left join rc r on r.vid = v.id left join rj j on j.vid = v.id
   where v.tenant_id = p_tenant and (o.vid is not null or r.vid is not null)
   order by v.name;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- production ----------
create or replace function mfg_production_kpis(p_tenant uuid, p_from date, p_to date)
returns table (item_id uuid, orders int, qty_good numeric, qty_scrap numeric, scrap_pct numeric, on_time int, late int, avg_lead_days numeric,
               std_unit_cost numeric, actual_unit_cost numeric) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose the dates to report on.'; end if;
  return query
  with o as (
    select po.*, (select max(c.posting_date) from mfg_confirmations c
                   where c.order_id = po.id and c.reversal_of is null and c.is_final
                     and not exists (select 1 from mfg_confirmations r where r.reversal_of = c.id)) as done
      from mfg_production_orders po
     where po.tenant_id = p_tenant and po.status in ('CONFIRMED', 'DELIVERED', 'TECHNICALLY_COMPLETE', 'CLOSED')
  ), cost as (
    select c.order_id as oid, sum(c.amount) as spent from mfg_order_costs c
     where c.tenant_id = p_tenant and c.element in ('MATERIAL', 'LABOR', 'MACHINE', 'VAR_OH', 'FIX_OH') group by 1
  )
  select o.item_id, count(*)::int, round(sum(o.qty_good), 4), round(sum(o.qty_scrap), 4),
         case when sum(o.qty_good + o.qty_scrap) > 0 then round(sum(o.qty_scrap) / sum(o.qty_good + o.qty_scrap) * 100, 1) end,
         count(*) filter (where o.planned_end is null or o.done <= o.planned_end)::int,
         count(*) filter (where o.planned_end is not null and o.done > o.planned_end)::int,
         round(avg((o.done - o.planned_start)::numeric), 1),
         round(sum(o.std_unit_cost * o.qty_good) / nullif(sum(o.qty_good), 0), 6),
         round(sum(coalesce(cost.spent, 0)) / nullif(sum(o.qty_good), 0), 6)
    from o left join cost on cost.oid = o.id
   where o.done between p_from and p_to
   group by o.item_id
   order by o.item_id;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- cost by lot size (writes nothing) ----------
create or replace function mfg_lot_size_curve(p_item uuid, p_lots numeric[], p_date date default current_date)
returns table (lot_size numeric, material numeric, labor numeric, machine numeric, var_oh numeric, fix_oh numeric, unit_cost numeric) as $$
declare
  v_t uuid := mfg__my_tenant();
  lot numeric; est uuid; v_detail text; r jsonb;
begin
  if p_lots is null or cardinality(p_lots) = 0 then raise exception 'Enter at least one lot size.'; end if;
  if cardinality(p_lots) > 12 then raise exception 'Use at most 12 lot sizes.'; end if;
  foreach lot in array p_lots loop
    if lot is null or lot <= 0 then raise exception 'Every lot size must be above zero.'; end if;
    begin
      est := mfg_create_cost_estimate(p_item, lot, coalesce(p_date, current_date));
      select jsonb_build_object(
               'material', coalesce(sum(l.amount) filter (where l.element = 'MATERIAL'), 0),
               'labor', coalesce(sum(l.amount) filter (where l.element = 'LABOR'), 0),
               'machine', coalesce(sum(l.amount) filter (where l.element = 'MACHINE'), 0),
               'var_oh', coalesce(sum(l.amount) filter (where l.element = 'VAR_OH'), 0),
               'fix_oh', coalesce(sum(l.amount) filter (where l.element = 'FIX_OH'), 0),
               'total', (select e.total_cost from mfg_cost_estimates e where e.id = est),
               'unit', (select e.unit_cost from mfg_cost_estimates e where e.id = est))
        into r from mfg_cost_estimate_lines l where l.estimate_id = est;
      raise exception 'lot-size-curve' using errcode = 'P0099', detail = r::text;
    exception when sqlstate 'P0099' then
      get stacked diagnostics v_detail = pg_exception_detail;
      r := v_detail::jsonb;
    end;
    lot_size := lot;
    material := round((r->>'material')::numeric / lot, 6);
    labor := round((r->>'labor')::numeric / lot, 6);
    machine := round((r->>'machine')::numeric / lot, 6);
    var_oh := round((r->>'var_oh')::numeric / lot, 6);
    fix_oh := round((r->>'fix_oh')::numeric / lot, 6);
    unit_cost := round((r->>'unit')::numeric, 6);
    return next;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the teacher's comparison of every Manufacturing company ----------
create or replace function mfg_class_comparison()
returns table (tenant_id uuid, company text, student text, costing_method text, revenue numeric, cogs numeric, gross_margin numeric,
               inventory_value numeric, orders_made int, good_qty numeric, scrap_pct numeric, variances numeric, months_closed int,
               books_tie boolean, last_activity date) as $$
declare
  t record;
  a_inv uuid[]; a_rev uuid[]; a_cogs uuid[];
  v_rev numeric; v_cogs numeric; v_good numeric; v_scrap numeric;
begin
  if auth.uid() is null or is_teacher() is not true then raise exception 'Only the teacher can compare the companies.'; end if;
  for t in
    select te.id, te.name as cname, coalesce(p.full_name, '—') as sname, s.costing_method as cm
      from tenant_editions e join tenants te on te.id = e.tenant_id join mfg_company_settings s on s.tenant_id = e.tenant_id
      left join profiles p on p.id = e.owner_id
     where e.edition = 'MANUFACTURING' order by te.name
  loop
    a_inv := mfg__acc_keys(t.id, array['RM_INVENTORY', 'PACKAGING_INVENTORY', 'FG_INVENTORY', 'WIP']);
    a_cogs := mfg__acc_keys(t.id, array['COGS']);
    select coalesce(array_agg(a.id), '{}'::uuid[]) into a_rev from accounts a where a.tenant_id = t.id and a.code = '4000';
    v_rev := -mfg__bal(t.id, a_rev, null, null);
    v_cogs := mfg__bal(t.id, a_cogs, null, null);
    select coalesce(sum(o.qty_good), 0), coalesce(sum(o.qty_scrap), 0) into v_good, v_scrap
      from mfg_production_orders o where o.tenant_id = t.id and o.status in ('CONFIRMED', 'DELIVERED', 'TECHNICALLY_COMPLETE', 'CLOSED');
    tenant_id := t.id; company := t.cname; student := t.sname; costing_method := t.cm;
    revenue := round(v_rev, 2); cogs := round(v_cogs, 2); gross_margin := round(v_rev - v_cogs, 2);
    inventory_value := round(mfg__bal(t.id, a_inv, null, null), 2);
    select count(*)::int into orders_made from mfg_production_orders o where o.tenant_id = t.id and o.status in ('CONFIRMED', 'DELIVERED', 'TECHNICALLY_COMPLETE', 'CLOSED');
    good_qty := round(v_good, 4);
    scrap_pct := case when v_good + v_scrap > 0 then round(v_scrap / (v_good + v_scrap) * 100, 1) end;
    variances := round(mfg__variance_net(t.id), 2);
    select count(*)::int into months_closed from mfg_periods mp where mp.tenant_id = t.id and mp.status = 'CLOSED';
    books_tie := not exists (select 1 from mfg_reconciliation(t.id) r where abs(r.difference) >= 0.10);
    select max(je.entry_date) into last_activity from journal_entries je where je.tenant_id = t.id;
    return next;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the books check before a month end allows a few centavos of rounding ----------
-- Under actual costing the stock is valued at a moving average carried to six decimals while each posting is rounded to the centavo,
-- so the stock records and the ledger can differ by a centavo or two. mfg_period_checks (from 0038, our own function) now blocks a month
-- only when an area is off by 10 centavos or more; mfg_class_comparison uses the same tolerance.
create or replace function mfg_period_checks(p_tenant uuid, p_start date)
returns table (code text, severity text, message text, n int) as $$
declare
  v_start date := date_trunc('month', p_start)::date;
  v_end date := (date_trunc('month', p_start) + interval '1 month' - interval '1 day')::date;
  v_lock date; k int; amt numeric; a_grir uuid; plan jsonb; v_pay numeric; v_status text;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_start is null then raise exception 'Choose a month.'; end if;
  select books_locked_through into v_lock from tenants where id = p_tenant;

  select p.status into v_status from mfg_periods p where p.tenant_id = p_tenant and p.period_start = v_start;
  if v_status is not null then
    return query select 'ALREADY'::text, 'block'::text, ('This month is already ' || lower(v_status) || '.')::text, 1;
    return;
  end if;

  select count(*) into k from (
    select date_trunc('month', je.entry_date)::date as m from journal_entries je
     where je.tenant_id = p_tenant and je.entry_date < v_start
     group by 1
    having not exists (select 1 from mfg_periods p where p.tenant_id = p_tenant and p.period_start = date_trunc('month', min(je.entry_date))::date and p.status = 'CLOSED')
  ) x;
  if k > 0 then
    return query select 'EARLIER_OPEN'::text, 'block'::text,
      (k || ' earlier month' || case when k = 1 then ' has' else 's have' end || ' activity but ' || case when k = 1 then 'is' else 'are' end || ' not closed yet. Close the months in order, oldest first.')::text, k;
  end if;

  if v_lock is not null and v_lock >= v_end then
    return query select 'LOCKED'::text, 'block'::text,
      ('The books are already locked through ' || to_char(v_lock, 'Mon DD, YYYY') || ', so nothing more can be posted to this month. Ask your teacher to move the lock date back.')::text, 1;
  end if;

  select count(*) into k from mfg_reconciliation(p_tenant) r where abs(r.difference) >= 0.10;
  if k > 0 then
    return query select 'RECONCILIATION'::text, 'block'::text,
      ('The books check (Inventory → Books check) shows ' || k || ' area' || case when k = 1 then '' else 's' end || ' where the ledger and the stock or order records do not agree by more than a few centavos. Fix that before closing.')::text, k;
  end if;

  select count(*) into k from mfg_production_orders o
   where o.tenant_id = p_tenant and o.status in ('CONFIRMED', 'DELIVERED')
     and exists (select 1 from mfg_order_costs c where c.order_id = o.id and c.posting_date <= v_end);
  if k > 0 then
    return query select 'ORDERS_NOT_SETTLED'::text, 'warn'::text,
      (k || ' finished production order' || case when k = 1 then ' has' else 's have' end || ' not been settled. Their variances will land in a later month unless you settle them first.')::text, k;
  end if;

  select count(*) into k from mfg_inspection_lots l where l.tenant_id = p_tenant and l.status in ('CREATED', 'IN_INSPECTION') and l.created_at::date <= v_end;
  if k > 0 then
    return query select 'QC_WAITING'::text, 'warn'::text,
      (k || ' inspection lot' || case when k = 1 then ' is' else 's are' end || ' still waiting for a decision, so that stock is not yet usable.')::text, k;
  end if;

  plan := mfg__period_plan(p_tenant, v_start);
  if (plan->'labor'->>'actual')::numeric > 0 then
    v_pay := mfg__bal(p_tenant, mfg__acc_keys(p_tenant, array['PAYROLL_EXPENSE']), v_start, v_end);
    if v_pay < (plan->'labor'->>'actual')::numeric then
      return query select 'WAGES_NOT_POSTED'::text, 'warn'::text,
        ('Production labor at the real wage rate comes to ' || to_char((plan->'labor'->>'actual')::numeric, 'FM999,999,990.00') ||
         ' but only ' || to_char(greatest(v_pay, 0), 'FM999,999,990.00') || ' of Payroll Expense was posted this month. Run payroll first, or Payroll Expense will go negative.')::text, 1;
    end if;
  end if;

  a_grir := mfg_account(p_tenant, 'GR_IR');
  amt := -mfg__bal(p_tenant, array[a_grir], null, v_end);
  if amt > 0.005 then
    return query select 'GRIR'::text, 'info'::text,
      ('Goods worth ' || to_char(amt, 'FM999,999,990.00') || ' were received and not yet invoiced. That stays as a liability in GR/IR, which is normal.')::text, 1;
  end if;

  if not exists (select 1 from journal_entries je where je.tenant_id = p_tenant and je.entry_date between v_start and v_end) then
    return query select 'NO_ACTIVITY'::text, 'info'::text, 'Nothing was posted in this month.'::text, 0;
  end if;
  if v_end >= current_date then
    return query select 'MONTH_NOT_OVER'::text, 'info'::text, 'This month is not over yet. If you close it, later entries dated in it will be refused.'::text, 1;
  end if;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg__var_map(uuid) from public, anon, authenticated;
revoke execute on function mfg__variance_net(uuid) from public, anon, authenticated;
revoke execute on function mfg_profitability(uuid, date, date) from public, anon;
revoke execute on function mfg_variance_trend(uuid, date, int) from public, anon;
revoke execute on function mfg_inventory_analysis(uuid, int) from public, anon;
revoke execute on function mfg_supplier_performance(uuid, date, date) from public, anon;
revoke execute on function mfg_production_kpis(uuid, date, date) from public, anon;
revoke execute on function mfg_lot_size_curve(uuid, numeric[], date) from public, anon;
revoke execute on function mfg_class_comparison() from public, anon;
grant execute on function mfg_profitability(uuid, date, date) to authenticated;
grant execute on function mfg_variance_trend(uuid, date, int) to authenticated;
grant execute on function mfg_inventory_analysis(uuid, int) to authenticated;
grant execute on function mfg_supplier_performance(uuid, date, date) to authenticated;
grant execute on function mfg_production_kpis(uuid, date, date) to authenticated;
grant execute on function mfg_lot_size_curve(uuid, numeric[], date) to authenticated;
grant execute on function mfg_class_comparison() to authenticated;
