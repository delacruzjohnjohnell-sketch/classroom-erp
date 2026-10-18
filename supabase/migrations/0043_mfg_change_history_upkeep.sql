-- ============================================================
-- Classroom ERP — migration 0043 (Manufacturing ERP, Phase 8c: change history, machine upkeep, standard-cost drift)
--
-- Needs 0023–0042. Everything here is new (mfg_ tables, columns on our own work-centre table, new functions and triggers on our own tables).
-- Nothing in the Standard ERP is touched.
--
--   Change history   mfg_change_log keeps who changed what and when: for each master record (items, bills of materials, routings, work centres,
--                    activity rates, overhead rates, unit conversions, quality flags, company settings) one line when it is created or deleted
--                    and one line per field that changed, with the old and the new value. It is written by a trigger, so no screen can forget
--                    to write it, and nobody can edit or delete it (there is no policy that allows it).
--   Upkeep           A work centre may be linked to one of the company's fixed assets and given a service interval in machine hours.
--                    mfg_log_maintenance records a service and starts the count again; mfg_work_center_usage reports, per work centre, the hours
--                    available, used and idle, the hours since the last service, and the linked asset's cost, depreciation and book value.
--   Cost drift       mfg_cost_drift re-runs the cost roll-up for every made item in a sub-transaction that is rolled back (nothing is saved)
--                    and compares it with the standard cost now in force; for bought items it compares the standard with the latest price paid.
--
-- ROLLBACK:
--   drop trigger if exists trg_mfg_log_item_master on mfg_item_master; (and the same for the other trg_mfg_log_* triggers listed below)
--   drop function if exists mfg_cost_drift(), mfg_work_center_usage(uuid, date, date), mfg_log_maintenance(uuid, date, text, text),
--     mfg_set_work_center_upkeep(uuid, uuid, numeric), mfg__wc_machine_hours(uuid, uuid, date), mfg_log_changes();
--   drop table if exists mfg_maintenance_log, mfg_change_log;
--   alter table mfg_work_centers drop column if exists asset_id, drop column if exists maint_interval_hours;
-- ============================================================

-- ---------- change history ----------
create table if not exists mfg_change_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  changed_at      timestamptz not null default now(),
  changed_by      uuid,
  changed_by_name text,
  table_name      text not null,
  record_id       uuid,
  record_label    text,
  action          text not null check (action in ('CREATE', 'CHANGE', 'DELETE')),
  field           text,
  old_value       text,
  new_value       text
);
create index if not exists mfg_change_log_when on mfg_change_log (tenant_id, changed_at desc);
create index if not exists mfg_change_log_record on mfg_change_log (tenant_id, table_name, record_id);
alter table mfg_change_log enable row level security;
drop policy if exists "mfg read" on mfg_change_log;
create policy "mfg read" on mfg_change_log for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING');

create or replace function mfg_log_changes()
returns trigger as $$
declare
  j_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  j_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  j jsonb := coalesce(j_new, j_old);
  v_t uuid := (j->>'tenant_id')::uuid;
  v_id uuid := coalesce((j->>'id')::uuid, (j->>'item_id')::uuid);
  v_label text; v_name text; k text;
  v_by uuid := auth.uid();
  skip text[] := array['id', 'tenant_id', 'created_at', 'created_by', 'updated_at', 'moving_avg_cost', 'low_level_code', 'document_number',
                       'previous_standard_cost', 'cost_version'];
begin
  -- a whole company being deleted is not a change worth recording (and its rows are going away)
  if nullif(current_setting('app.deleting_company', true), '') is not null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if not exists (select 1 from tenants where id = v_t) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  v_label := case tg_table_name
    when 'mfg_item_master' then (select i.sku || ' — ' || i.name from items i where i.id = (j->>'item_id')::uuid)
    when 'mfg_item_quality' then (select i.sku || ' — ' || i.name from items i where i.id = (j->>'item_id')::uuid)
    when 'mfg_boms' then coalesce(j->>'document_number', 'BOM') || ' — ' || coalesce((select i.name from items i where i.id = (j->>'item_id')::uuid), '')
    when 'mfg_routings' then coalesce(j->>'document_number', 'Routing') || ' — ' || coalesce((select i.name from items i where i.id = (j->>'item_id')::uuid), '')
    when 'mfg_uom_conversions' then (j->>'from_uom') || ' → ' || (j->>'to_uom') || coalesce(' (' || (select i.sku from items i where i.id = (j->>'item_id')::uuid) || ')', '')
    when 'mfg_activity_rates' then coalesce((select w.name from mfg_work_centers w where w.id = (j->>'work_center_id')::uuid), '?') || ' / '
                                   || coalesce((select a.name from mfg_activity_types a where a.id = (j->>'activity_type_id')::uuid), '?') || ' from ' || (j->>'period_start')
    when 'mfg_company_settings' then 'Company settings'
    else coalesce(j->>'name', j->>'code', j->>'document_number') end;
  if v_by is not null then select p.full_name into v_name from profiles p where p.id = v_by; end if;
  v_name := coalesce(v_name, 'System');

  if tg_op = 'INSERT' then
    insert into mfg_change_log (tenant_id, changed_by, changed_by_name, table_name, record_id, record_label, action) values (v_t, v_by, v_name, tg_table_name, v_id, v_label, 'CREATE');
    return new;
  elsif tg_op = 'DELETE' then
    insert into mfg_change_log (tenant_id, changed_by, changed_by_name, table_name, record_id, record_label, action) values (v_t, v_by, v_name, tg_table_name, v_id, v_label, 'DELETE');
    return old;
  end if;
  for k in select jsonb_object_keys(j_new) loop
    if k = any(skip) then continue; end if;
    if j_new->k is distinct from j_old->k then
      insert into mfg_change_log (tenant_id, changed_by, changed_by_name, table_name, record_id, record_label, action, field, old_value, new_value)
      values (v_t, v_by, v_name, tg_table_name, v_id, v_label, 'CHANGE', k, j_old->>k, j_new->>k);
    end if;
  end loop;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_mfg_log_item_master on mfg_item_master;
create trigger trg_mfg_log_item_master after insert or update or delete on mfg_item_master for each row execute function mfg_log_changes();
drop trigger if exists trg_mfg_log_boms on mfg_boms;
create trigger trg_mfg_log_boms after insert or update or delete on mfg_boms for each row execute function mfg_log_changes();
drop trigger if exists trg_mfg_log_routings on mfg_routings;
create trigger trg_mfg_log_routings after insert or update or delete on mfg_routings for each row execute function mfg_log_changes();
drop trigger if exists trg_mfg_log_work_centers on mfg_work_centers;
create trigger trg_mfg_log_work_centers after insert or update or delete on mfg_work_centers for each row execute function mfg_log_changes();
drop trigger if exists trg_mfg_log_activity_rates on mfg_activity_rates;
create trigger trg_mfg_log_activity_rates after insert or update or delete on mfg_activity_rates for each row execute function mfg_log_changes();
drop trigger if exists trg_mfg_log_costing_sheet on mfg_costing_sheet;
create trigger trg_mfg_log_costing_sheet after insert or update or delete on mfg_costing_sheet for each row execute function mfg_log_changes();
drop trigger if exists trg_mfg_log_uom_conversions on mfg_uom_conversions;
create trigger trg_mfg_log_uom_conversions after insert or update or delete on mfg_uom_conversions for each row execute function mfg_log_changes();
drop trigger if exists trg_mfg_log_item_quality on mfg_item_quality;
create trigger trg_mfg_log_item_quality after insert or update or delete on mfg_item_quality for each row execute function mfg_log_changes();
drop trigger if exists trg_mfg_log_company_settings on mfg_company_settings;
create trigger trg_mfg_log_company_settings after update on mfg_company_settings for each row execute function mfg_log_changes();

-- ---------- machine upkeep ----------
alter table mfg_work_centers add column if not exists asset_id uuid;                 -- a row of fixed_assets; checked by mfg_set_work_center_upkeep
alter table mfg_work_centers add column if not exists maint_interval_hours numeric(10, 2) check (maint_interval_hours is null or maint_interval_hours > 0);

create table if not exists mfg_maintenance_log (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  work_center_id     uuid not null references mfg_work_centers(id) on delete cascade,
  done_on            date not null,
  kind               text not null check (kind in ('PREVENTIVE', 'REPAIR')),
  machine_h_at_service numeric(18, 6) not null,
  note               text,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now()
);
create index if not exists mfg_maintenance_log_wc on mfg_maintenance_log (tenant_id, work_center_id, done_on);
alter table mfg_maintenance_log enable row level security;
drop policy if exists "mfg read" on mfg_maintenance_log;
create policy "mfg read" on mfg_maintenance_log for select
  using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING');

create or replace function mfg_set_work_center_upkeep(p_wc uuid, p_asset uuid, p_interval numeric)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
begin
  if not exists (select 1 from mfg_work_centers where id = p_wc and tenant_id = v_t) then raise exception 'Choose one of your work centers.'; end if;
  if p_asset is not null and not exists (select 1 from fixed_assets where id = p_asset and tenant_id = v_t) then
    raise exception 'Choose one of your company''s fixed assets (add it under Fixed Assets first).';
  end if;
  if p_interval is not null and p_interval <= 0 then raise exception 'The service interval must be above zero hours.'; end if;
  update mfg_work_centers set asset_id = p_asset, maint_interval_hours = p_interval where id = p_wc;
end;
$$ language plpgsql security definer set search_path = public;

-- machine hours ever confirmed on a work centre up to a date (reversals carry the opposite sign, so they net out)
create or replace function mfg__wc_machine_hours(p_tenant uuid, p_wc uuid, p_upto date)
returns numeric as $$
  select coalesce(sum(c.machine_h), 0)
    from mfg_confirmations c join mfg_prod_operations o on o.order_id = c.order_id and o.op_no = c.op_no
   where c.tenant_id = p_tenant and o.work_center_id = p_wc and c.posting_date <= p_upto;
$$ language sql stable set search_path = public;

create or replace function mfg_log_maintenance(p_wc uuid, p_date date, p_kind text, p_note text)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_id uuid;
begin
  if not exists (select 1 from mfg_work_centers where id = p_wc and tenant_id = v_t) then raise exception 'Choose one of your work centers.'; end if;
  if upper(coalesce(p_kind, '')) not in ('PREVENTIVE', 'REPAIR') then raise exception 'Choose preventive service or repair.'; end if;
  if p_date is null then raise exception 'Enter the date of the service.'; end if;
  if p_date > current_date then raise exception 'A service can''t be dated in the future.'; end if;
  insert into mfg_maintenance_log (tenant_id, work_center_id, done_on, kind, machine_h_at_service, note)
  values (v_t, p_wc, p_date, upper(p_kind), mfg__wc_machine_hours(v_t, p_wc, p_date), nullif(trim(coalesce(p_note, '')), '')) returning id into v_id;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_work_center_usage(p_tenant uuid, p_from date, p_to date)
returns table (work_center_id uuid, code text, name text, available_h numeric, setup_h numeric, machine_h numeric, labor_h numeric, utilization_pct numeric,
               total_machine_h numeric, hours_since_service numeric, service_interval_h numeric, last_service date, service_status text,
               asset_id uuid, asset_name text, asset_cost numeric, accumulated_depreciation numeric, book_value numeric) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a period (from, to).'; end if;
  return query
  with use as (
    select o.work_center_id as wid, sum(c.setup_h) as sh, sum(c.machine_h) as mh, sum(c.labor_h) as lh
      from mfg_confirmations c join mfg_prod_operations o on o.order_id = c.order_id and o.op_no = c.op_no
     where c.tenant_id = p_tenant and c.posting_date between p_from and p_to group by 1
  ), svc as (
    select distinct on (l.work_center_id) l.work_center_id as wid, l.done_on, l.machine_h_at_service as hrs
      from mfg_maintenance_log l where l.tenant_id = p_tenant and l.kind = 'PREVENTIVE' order by l.work_center_id, l.done_on desc, l.machine_h_at_service desc, l.created_at desc
  ), x as (
    select w.id as wid, w.code as wcode, w.name as wname, w.maint_interval_hours as ivl, w.asset_id as aid,
           round(mfg_wc_available_hours(w.id, p_from, p_to), 2) as av,
           round(coalesce(u.sh, 0), 2) as sh, round(coalesce(u.mh, 0), 2) as mh, round(coalesce(u.lh, 0), 2) as lh,
           round(mfg__wc_machine_hours(p_tenant, w.id, current_date), 2) as tot, s.done_on as ld, coalesce(s.hrs, 0) as at_hrs
      from mfg_work_centers w left join use u on u.wid = w.id left join svc s on s.wid = w.id
     where w.tenant_id = p_tenant and w.active
  )
  select x.wid, x.wcode, x.wname, x.av, x.sh, x.mh, x.lh,
         case when x.av > 0 then round((x.sh + x.mh) * 100 / x.av, 1) else 0 end,
         x.tot, round(x.tot - x.at_hrs, 2), x.ivl, x.ld,
         case when x.ivl is null then 'NO_PLAN' when x.tot - x.at_hrs >= x.ivl then 'OVERDUE' when x.tot - x.at_hrs >= 0.9 * x.ivl then 'DUE_SOON' else 'OK' end,
         fa.id, fa.name, fa.cost, fa.accumulated_depreciation, case when fa.id is null then null else fa.cost - fa.accumulated_depreciation end
    from x left join fixed_assets fa on fa.id = x.aid and fa.tenant_id = p_tenant
   order by x.wcode;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- standard-cost drift ----------
-- For every made item: the cost roll-up as it would come out today (computed and thrown away) against the standard cost now in force.
-- For every bought item: the standard cost against the latest price paid (or the planned price when nothing was bought yet).
create or replace function mfg_cost_drift()
returns table (item_id uuid, kind text, standard_cost numeric, current_basis numeric, difference numeric, difference_pct numeric, basis_note text) as $$
declare
  v_t uuid := mfg__my_tenant();
  m record; est uuid; v_lot numeric; v_unit numeric; v_detail text; v_basis numeric; v_note text;
begin
  for m in
    select i.item_id as iid, i.make_or_buy as mb, i.standard_cost as sc, i.planned_price, i.price_unit, i.lot_size
      from mfg_item_master i
     where i.tenant_id = v_t and i.active and i.item_type <> 'SERVICE' and (i.standard_cost > 0 or i.make_or_buy = 'MAKE')
     order by i.item_id
  loop
    v_basis := null; v_note := null;
    if m.mb = 'MAKE' then
      select e.lot_size into v_lot from mfg_cost_estimates e where e.tenant_id = v_t and e.item_id = m.iid and e.status = 'RELEASED' order by e.released_at desc nulls last limit 1;
      v_lot := coalesce(v_lot, nullif(m.lot_size, 0), 1);
      begin
        est := mfg_create_cost_estimate(m.iid, v_lot, current_date);
        select e.unit_cost into v_unit from mfg_cost_estimates e where e.id = est;
        raise exception 'cost-drift' using errcode = 'P0099', detail = v_unit::text;
      exception
        when sqlstate 'P0099' then
          get stacked diagnostics v_detail = pg_exception_detail;
          v_basis := v_detail::numeric;
          v_note := 'Roll-up of the active bill and routing today, for a lot of ' || trim_scale(v_lot);
        when others then
          v_note := 'Not costed: ' || sqlerrm;
      end;
    else
      select round(l.unit_cost, 6) into v_basis
        from mfg_material_doc_lines dl join purchase_order_lines l on l.id = dl.po_line_id join mfg_material_documents d on d.id = dl.doc_id
       where dl.tenant_id = v_t and dl.item_id = m.iid and dl.qty_change > 0 and d.doc_type = 'GR'
       order by d.posting_date desc, d.created_at desc limit 1;
      if v_basis is not null then v_note := 'Latest price paid on a goods receipt';
      else v_basis := round(m.planned_price / nullif(m.price_unit, 0), 6); v_note := 'Planned price (nothing bought yet)'; end if;
    end if;
    item_id := m.iid; kind := m.mb; standard_cost := m.sc; current_basis := v_basis; basis_note := v_note;
    difference := case when v_basis is null then null else round(v_basis - m.sc, 6) end;
    difference_pct := case when v_basis is null or m.sc = 0 then null else round((v_basis - m.sc) * 100 / m.sc, 2) end;
    return next;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg_log_changes() from public, anon, authenticated;
revoke execute on function mfg__wc_machine_hours(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function mfg_set_work_center_upkeep(uuid, uuid, numeric) from public, anon;
revoke execute on function mfg_log_maintenance(uuid, date, text, text) from public, anon;
revoke execute on function mfg_work_center_usage(uuid, date, date) from public, anon;
revoke execute on function mfg_cost_drift() from public, anon;
grant execute on function mfg_set_work_center_upkeep(uuid, uuid, numeric) to authenticated;
grant execute on function mfg_log_maintenance(uuid, date, text, text) to authenticated;
grant execute on function mfg_work_center_usage(uuid, date, date) to authenticated;
grant execute on function mfg_cost_drift() to authenticated;
