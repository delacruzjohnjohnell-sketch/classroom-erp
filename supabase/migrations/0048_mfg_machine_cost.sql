-- ============================================================
-- Classroom ERP — migration 0048 (Manufacturing ERP, Phase 10: machine cost at the real depreciation)
--
-- Needs 0023–0047. ADDITIVE ONLY. Redefines five Manufacturing functions of our own with the same signatures (mfg__period_plan, mfg_period_checks,
-- mfg_period_preview, mfg_settle_period from 0038, and mfg_register_voucher from 0046) and adds one read function. No Standard table, function,
-- policy or trigger is changed.
--
-- THE GAP. A production confirmation already puts machine cost into work in process at the PLANNED machine rate (Dr Work in process, Cr Applied
-- Machine Overhead). The machine's real cost — its depreciation, recorded on Fixed Assets as Dr Depreciation Expense — is a different number that
-- nobody compared with it: the planned rate is typed by hand, and the difference stayed in operating expenses forever.
--
-- THE FIX (month end, like the labor restatement). For every fixed asset that a work center is linked to (Shop Floor → Machines & upkeep), settling
-- a month now posts, in the same entry as the labor restatement:
--     Dr Applied Machine Overhead   the machine cost the month's confirmations applied for that asset's work centers
--     Dr/Cr Machine overhead variance   the difference
--     Cr Depreciation Expense       the depreciation actually recorded for the asset in the month
-- The variance then follows the company's "overhead close" setting with the other overhead variances (to cost of goods sold, or shared over
-- work in process, finished goods and cost of goods sold). With no linked asset the plan is exactly what it was before.
-- Settling warns when a linked machine worked in the month and no depreciation was recorded for it.
--
--   mfg_machine_cost  per linked machine and date range: machine hours, the planned rate, the machine cost applied, the depreciation recorded,
--                     the difference and the real rate per machine hour (what the planned rate should be).
--   mfg_register_voucher  also types Standard's depreciation postings (no source link, memo "Depreciation, <asset>") as a Depreciation Voucher.
--
-- ROLLBACK: re-run 0038 (mfg__period_plan, mfg_period_checks, mfg_period_preview, mfg_settle_period) and 0046 (mfg_register_voucher), then
--   drop function if exists mfg_machine_cost(uuid, date, date);
-- ============================================================

create or replace function mfg__period_plan(p_tenant uuid, p_start date)
returns jsonb as $$
declare
  v_start date := date_trunc('month', p_start)::date;
  v_end date := (date_trunc('month', p_start) + interval '1 month' - interval '1 day')::date;
  st mfg_company_settings;
  a_lab uuid := mfg_account(p_tenant, 'APPLIED_LABOR');
  a_rate uuid := mfg_account(p_tenant, 'LABOR_RATE_VAR');
  a_pay uuid := mfg_account(p_tenant, 'PAYROLL_EXPENSE');
  a_mach uuid := mfg_account(p_tenant, 'APPLIED_MACHINE');
  a_mvar uuid := mfg_account(p_tenant, 'MACHINE_OH_VAR');
  a_dep uuid;
  a_wip uuid := mfg_account(p_tenant, 'WIP');
  a_fg uuid := mfg_account(p_tenant, 'FG_INVENTORY');
  a_cogs uuid := mfg_account(p_tenant, 'COGS');
  l_h numeric := 0; l_app numeric := 0; l_act numeric := 0; l_var numeric := 0;
  m_app numeric := 0; m_act numeric := 0; m_var numeric := 0; m_hours numeric := 0; m_assets int := 0;
  lab_lines jsonb := '[]'::jsonb; mach_lines jsonb := '[]'::jsonb; close_lines jsonb := '[]'::jsonb; vars jsonb := '[]'::jsonb;
  r record; amt numeric; meth text; sh_w numeric; sh_f numeric; sh_c numeric;
  wb numeric; fb numeric; cb numeric; base numeric; tot_w numeric := 0; tot_f numeric := 0; tot_c numeric := 0;
begin
  select * into st from mfg_company_settings where tenant_id = p_tenant;

  -- 1. production labor at the real wage (standard costing only)
  if st.costing_method = 'STANDARD' then
    select coalesce(sum(c.labor_h + c.setup_h), 0), coalesce(sum(c.labor_cost), 0),
           coalesce(sum(round((c.labor_h + c.setup_h) * case when e.pay_type = 'hourly' then e.hourly_rate else e.salary / 12 / 173.33 end, 2)), 0)
      into l_h, l_app, l_act
      from mfg_confirmations c join employees e on e.id = c.employee_id and e.tenant_id = p_tenant
     where c.tenant_id = p_tenant and c.employee_id is not null and c.posting_date between v_start and v_end
       and coalesce(case when e.pay_type = 'hourly' then e.hourly_rate else e.salary / 12 / 173.33 end, 0) > 0;
    l_var := l_act - l_app;
    if l_h <> 0 or l_app <> 0 then
      lab_lines := lab_lines || coalesce(mfg__line(a_lab, l_app), '[]'::jsonb)
                             || coalesce(mfg__line(a_rate, l_var), '[]'::jsonb)
                             || coalesce(mfg__line(a_pay, -l_act), '[]'::jsonb);
    end if;
  end if;

  -- 1b. machine cost at the real depreciation of the machines a work center is linked to
  select a.id into a_dep from accounts a where a.tenant_id = p_tenant and a.code = '5400';
  if a_dep is not null then
    for r in
      select fa.id,
             coalesce((select sum(d.amount) from depreciation_entries d where d.fixed_asset_id = fa.id and d.entry_date between v_start and v_end), 0) as act,
             coalesce((select sum(c.machine_cost) from mfg_confirmations c
                         join mfg_prod_operations o on o.order_id = c.order_id and o.op_no = c.op_no
                         join mfg_work_centers w on w.id = o.work_center_id
                        where c.tenant_id = p_tenant and w.asset_id = fa.id and c.posting_date between v_start and v_end), 0) as app,
             coalesce((select sum(c.machine_h) from mfg_confirmations c
                         join mfg_prod_operations o on o.order_id = c.order_id and o.op_no = c.op_no
                         join mfg_work_centers w on w.id = o.work_center_id
                        where c.tenant_id = p_tenant and w.asset_id = fa.id and c.posting_date between v_start and v_end), 0) as hrs
        from fixed_assets fa
       where fa.tenant_id = p_tenant and exists (select 1 from mfg_work_centers w where w.tenant_id = p_tenant and w.asset_id = fa.id)
    loop
      if r.act <> 0 or r.app <> 0 then
        m_act := m_act + r.act; m_app := m_app + r.app; m_hours := m_hours + r.hrs; m_assets := m_assets + 1;
      end if;
    end loop;
    m_act := round(m_act, 2); m_app := round(m_app, 2); m_var := m_act - m_app;
    if m_act <> 0 or m_app <> 0 then
      mach_lines := mach_lines || coalesce(mfg__line(a_mach, m_app), '[]'::jsonb)
                 || coalesce(mfg__line(a_mvar, m_var), '[]'::jsonb)
                 || coalesce(mfg__line(a_dep, -m_act), '[]'::jsonb);
    end if;
  end if;

  -- 2. closing the variances
  wb := greatest(mfg__bal(p_tenant, array[a_wip], null, v_end), 0);
  fb := greatest(mfg__bal(p_tenant, array[a_fg], null, v_end), 0);
  cb := greatest(mfg__bal(p_tenant, array[a_cogs], v_start, v_end), 0);
  base := wb + fb + cb;
  for r in
    select distinct on (d.account_id) d.account_id, a.code, a.name, (d.key in ('MACHINE_OH_VAR', 'FIXED_OH_VAR')) as oh
      from mfg_account_determination d join accounts a on a.id = d.account_id
     where d.tenant_id = p_tenant
       and d.key in ('PPV', 'MATERIAL_USAGE_VAR', 'LABOR_EFF_VAR', 'LABOR_RATE_VAR', 'LOT_SIZE_VAR', 'MIX_VAR', 'MACHINE_OH_VAR', 'FIXED_OH_VAR')
     order by d.account_id, (d.key in ('MACHINE_OH_VAR', 'FIXED_OH_VAR'))
  loop
    amt := round(mfg__bal(p_tenant, array[r.account_id], null, v_end)
                 + case when r.account_id = a_rate then l_var else 0 end
                 + case when r.account_id = a_mvar then m_var else 0 end, 2);
    if amt = 0 then continue; end if;
    meth := case when r.oh then st.oh_close_method else st.variance_close_method end;
    if meth = 'PRORATE' and base > 0 then
      sh_w := round(amt * wb / base, 2); sh_f := round(amt * fb / base, 2); sh_c := amt - sh_w - sh_f;
    else
      sh_w := 0; sh_f := 0; sh_c := amt;
    end if;
    tot_w := tot_w + sh_w; tot_f := tot_f + sh_f; tot_c := tot_c + sh_c;
    close_lines := close_lines || coalesce(mfg__line(r.account_id, -amt), '[]'::jsonb);
    vars := vars || jsonb_build_object('account_id', r.account_id, 'code', r.code, 'name', r.name, 'amount', amt, 'method', meth,
                                       'wip', sh_w, 'fg', sh_f, 'cogs', sh_c);
  end loop;
  close_lines := close_lines || coalesce(mfg__line(a_wip, tot_w), '[]'::jsonb) || coalesce(mfg__line(a_fg, tot_f), '[]'::jsonb)
                             || coalesce(mfg__line(a_cogs, tot_c), '[]'::jsonb);

  return jsonb_build_object(
    'period_start', v_start, 'period_end', v_end, 'costing', st.costing_method,
    'labor', jsonb_build_object('hours', l_h, 'applied', l_app, 'actual', l_act, 'variance', l_var),
    'machine', jsonb_build_object('hours', m_hours, 'applied', m_app, 'actual', m_act, 'variance', m_var, 'assets', m_assets),
    'labor_lines', lab_lines, 'machine_lines', mach_lines, 'variances', vars, 'close_lines', close_lines,
    'to_wip', tot_w, 'to_fg', tot_f, 'to_cogs', tot_c,
    'bases', jsonb_build_object('wip', wb, 'fg', fb, 'cogs', cb),
    'methods', jsonb_build_object('variance', st.variance_close_method, 'overhead', st.oh_close_method));
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- checks before settling (adds one warning) ----------
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

  select count(*) into k from mfg_reconciliation(p_tenant) r where abs(r.difference) >= 0.01;
  if k > 0 then
    return query select 'RECONCILIATION'::text, 'block'::text,
      ('The books check (Inventory → Books check) shows ' || k || ' area' || case when k = 1 then '' else 's' end || ' where the ledger and the stock or order records do not agree. Fix that before closing.')::text, k;
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

  select count(*) into k from fixed_assets fa
   where fa.tenant_id = p_tenant and exists (select 1 from mfg_work_centers w where w.tenant_id = p_tenant and w.asset_id = fa.id)
     and coalesce((select sum(c.machine_cost) from mfg_confirmations c join mfg_prod_operations o on o.order_id = c.order_id and o.op_no = c.op_no
                    join mfg_work_centers w on w.id = o.work_center_id
                   where c.tenant_id = p_tenant and w.asset_id = fa.id and c.posting_date between v_start and v_end), 0) <> 0
     and not exists (select 1 from depreciation_entries d where d.fixed_asset_id = fa.id and d.entry_date between v_start and v_end);
  if k > 0 then
    return query select 'DEPRECIATION_MISSING'::text, 'warn'::text,
      (k || ' machine' || case when k = 1 then '' else 's' end || ' worked this month but no depreciation was recorded for ' || case when k = 1 then 'it' else 'them' end ||
       ' (Fixed Assets). Record it first, or the machine cost will be settled against zero real cost.')::text, k;
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

-- ---------- preview ----------
create or replace function mfg_period_preview(p_tenant uuid, p_start date)
returns jsonb as $$
declare
  plan jsonb; disp jsonb := '[]'::jsonb; e record;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_start is null then raise exception 'Choose a month.'; end if;
  plan := mfg__period_plan(p_tenant, p_start);
  for e in
    select s.entry, s.ord, a.code, a.name, (s.l->>'debit')::numeric as debit, (s.l->>'credit')::numeric as credit
      from (select 'labor'::text as entry, t.ord, t.l from jsonb_array_elements(plan->'labor_lines') with ordinality t(l, ord)
            union all
            select 'machine'::text, t.ord + 50, t.l from jsonb_array_elements(plan->'machine_lines') with ordinality t(l, ord)
            union all
            select 'variances'::text, t.ord + 100, t.l from jsonb_array_elements(plan->'close_lines') with ordinality t(l, ord)) s
      join accounts a on a.id = (s.l->>'account_id')::uuid
     order by s.ord
  loop
    disp := disp || jsonb_build_object('entry', e.entry, 'code', e.code, 'name', e.name, 'debit', e.debit, 'credit', e.credit);
  end loop;
  return plan || jsonb_build_object('display', disp);
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- settle (labor and machine cost go in the first entry) ----------
create or replace function mfg_settle_period(p_start date, p_note text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_start date; v_end date; v_id uuid := gen_random_uuid(); plan jsonb; je1 uuid; je2 uuid; m text; first_lines jsonb;
begin
  if p_start is null then raise exception 'Choose a month.'; end if;
  v_start := date_trunc('month', p_start)::date;
  v_end := (date_trunc('month', p_start) + interval '1 month' - interval '1 day')::date;
  select c.message into m from mfg_period_checks(v_t, v_start) c where c.severity = 'block' order by c.code limit 1;
  if m is not null then raise exception '%', m; end if;
  plan := mfg__period_plan(v_t, v_start);
  insert into mfg_periods (id, tenant_id, period_start, period_end, status, detail, note, settled_by)
  values (v_id, v_t, v_start, v_end, 'SETTLED', plan, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  first_lines := coalesce(plan->'labor_lines', '[]'::jsonb) || coalesce(plan->'machine_lines', '[]'::jsonb);
  if jsonb_array_length(first_lines) > 0 then
    je1 := mfg__post_entry(v_t, v_end, 'Month end ' || to_char(v_start, 'Mon YYYY') || ': production labor and machine cost at the real rate', 'mfg_periods', v_id, first_lines);
  end if;
  if jsonb_array_length(plan->'close_lines') > 0 then
    je2 := mfg__post_entry(v_t, v_end, 'Month end ' || to_char(v_start, 'Mon YYYY') || ': variances closed', 'mfg_periods', v_id, plan->'close_lines');
  end if;
  update mfg_periods set labor_je = je1, close_je = je2 where id = v_id;
  if (plan->>'to_wip')::numeric <> 0 then insert into mfg_period_adjust (tenant_id, period_id, key, amount) values (v_t, v_id, 'WIP', (plan->>'to_wip')::numeric); end if;
  if (plan->>'to_fg')::numeric <> 0 then insert into mfg_period_adjust (tenant_id, period_id, key, amount) values (v_t, v_id, 'FG_INVENTORY', (plan->>'to_fg')::numeric); end if;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'period_settled', jsonb_build_object('period', to_char(v_start, 'YYYY-MM'), 'labor_variance', plan->'labor'->'variance', 'machine_variance', plan->'machine'->'variance',
          'variances_closed', (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(plan->'variances') x)), auth.uid());
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the report: each linked machine's real depreciation against the machine cost applied ----------
create or replace function mfg_machine_cost(p_tenant uuid, p_from date, p_to date)
returns table (asset_id uuid, asset_name text, work_centers text, machine_h numeric, applied numeric, depreciation numeric, difference numeric,
               applied_rate numeric, actual_rate numeric) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose the dates to report on.'; end if;
  return query
  select q.id, q.name, q.wcs, q.hrs, q.app, q.act, round(q.act - q.app, 2),
         case when q.hrs > 0 then round(q.app / q.hrs, 2) end, case when q.hrs > 0 then round(q.act / q.hrs, 2) end
    from (
      select fa.id, fa.name,
             (select string_agg(w.name, ', ' order by w.name) from mfg_work_centers w where w.tenant_id = p_tenant and w.asset_id = fa.id) as wcs,
             coalesce((select sum(c.machine_h) from mfg_confirmations c join mfg_prod_operations o on o.order_id = c.order_id and o.op_no = c.op_no
                         join mfg_work_centers w on w.id = o.work_center_id
                        where c.tenant_id = p_tenant and w.asset_id = fa.id and c.posting_date between p_from and p_to), 0) as hrs,
             coalesce((select sum(c.machine_cost) from mfg_confirmations c join mfg_prod_operations o on o.order_id = c.order_id and o.op_no = c.op_no
                         join mfg_work_centers w on w.id = o.work_center_id
                        where c.tenant_id = p_tenant and w.asset_id = fa.id and c.posting_date between p_from and p_to), 0) as app,
             coalesce((select sum(d.amount) from depreciation_entries d where d.fixed_asset_id = fa.id and d.entry_date between p_from and p_to), 0) as act
        from fixed_assets fa
       where fa.tenant_id = p_tenant and exists (select 1 from mfg_work_centers w where w.tenant_id = p_tenant and w.asset_id = fa.id)
    ) q
   order by q.name;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- Standard's depreciation postings carry no source link; type them by their memo ----------
create or replace function mfg_register_voucher()
returns trigger as $$
begin
  if tenant_edition(new.tenant_id) is distinct from 'MANUFACTURING' then return new; end if;
  if coalesce(current_setting('mfg.voucher_id', true), '') <> '' then return new; end if;
  insert into mfg_vouchers (tenant_id, voucher_no, kind, voucher_type, voucher_date, period, particulars, status, journal_entry_id, source_table, source_id, prepared_by, prepared_at)
  values (new.tenant_id, mfg__next_jv(new.tenant_id, new.entry_date), 'SYSTEM',
          case when new.source_table is null and new.memo like 'Depreciation, %' then 'Depreciation Voucher' else mfg__voucher_type(new.source_table) end,
          new.entry_date, to_char(new.entry_date, 'YYYY-MM'), new.memo, 'POSTED', new.id, new.source_table, new.source_id, new.created_by, new.created_at);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function mfg__period_plan(uuid, date) from public, anon, authenticated;
revoke execute on function mfg_machine_cost(uuid, date, date) from public, anon;
grant execute on function mfg_machine_cost(uuid, date, date) to authenticated;
