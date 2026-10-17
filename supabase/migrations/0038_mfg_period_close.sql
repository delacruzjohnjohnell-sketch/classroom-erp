-- ============================================================
-- Classroom ERP — migration 0038 (Manufacturing ERP, Phase 7a: period-end close and the cost of goods manufactured)
--
-- Needs 0023–0037. ADDITIVE ONLY: two new tables and new functions. One Manufacturing-only function of our own is redefined with
-- the same signature (mfg_reconciliation, from 0033) so that the books check knows about month-end allocations.
-- No Standard table, function, policy or trigger is changed.
--
--   Months                     A period is a calendar month. A month is OPEN (no record), SETTLED (its month-end entries are posted)
--                              or CLOSED (settled and the books are locked through the last day of the month).
--   Checks (mfg_period_checks) Blocking checks: an earlier month with activity is not closed, the month is already settled, the books
--                              are already locked through its end, or the books check (reconciliation) does not tie. Warnings:
--                              finished orders not settled, inspection lots waiting, production wages never posted through payroll.
--   Settle (mfg_settle_period) Posts, dated the last day of the month, in this order:
--                                1. Labor at the real wage rate (standard costing only). Confirmations that name an employee were
--                                   costed at the planned rate; the wage is the employee's hourly rate (or monthly salary ÷ 12 ÷ 173.33)
--                                   × the hours. Dr Applied Direct Labor (planned amount), Dr/Cr Labor Rate Variance (the difference),
--                                   Cr Payroll Expense (the real wage). Payroll Expense is credited because the payroll run debited it.
--                                2. Closing the variances. The balances of Purchase Price, Material Usage, Labor Efficiency, Labor Rate,
--                                   Lot-size/Mix variance accounts follow the company's "variance close" method; Machine/Variable and Fixed
--                                   Overhead variances follow its "overhead close" method. COGS: everything goes to Cost of Goods Sold.
--                                   PRORATE: split across Work in Process, Finished Goods and the month's Cost of Goods Sold in proportion
--                                   to their balances at month end (the cost of goods sold takes the rounding).
--                              Scrap & Rework Loss, Revaluation, Rounding and Cost of Poor Quality are real losses and stay where they are.
--                              Amounts allocated to inventory are remembered (mfg_period_adjust) so the books check can still tie.
--   Undo, close, re-open       mfg_undo_period_settlement reverses a SETTLED month; mfg_close_period locks the books through the month end
--                              (remembering the old lock); mfg_reopen_period (teacher only, latest closed month only) reverses the entries
--                              and puts the lock back. Reversals are new entries — nothing is ever deleted from the journal.
--   Preview (mfg_period_preview)  The exact lines that settling would post, worked out by the same function.
--   COGM (mfg_cogm)            The statement of cost of goods manufactured for any date range, built from the ledger (account balances)
--                              and tied out to the production documents (order costs): materials, work in process and goods received.
--
-- ROLLBACK (drops only what this file created; then re-run 0033 to restore mfg_reconciliation):
--   drop function if exists mfg_cogm(uuid, date, date), mfg_reopen_period(uuid, date, text), mfg_close_period(date),
--     mfg_undo_period_settlement(date, text), mfg__period_reverse(uuid, mfg_periods, text), mfg_settle_period(date, text),
--     mfg_period_preview(uuid, date), mfg_period_list(uuid), mfg_period_checks(uuid, date), mfg__period_plan(uuid, date),
--     mfg__line(uuid, numeric), mfg__acc_keys(uuid, text[]), mfg__bal(uuid, uuid[], date, date);
--   drop table if exists mfg_period_adjust, mfg_periods;
-- ============================================================

-- ---------- tables ----------
create table if not exists mfg_periods (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  status       text not null check (status in ('SETTLED', 'CLOSED')),
  labor_je     uuid references journal_entries(id) on delete set null,
  close_je     uuid references journal_entries(id) on delete set null,
  prior_lock   date,
  detail       jsonb not null default '{}'::jsonb,
  note         text,
  settled_by   uuid,
  settled_at   timestamptz not null default now(),
  closed_by    uuid,
  closed_at    timestamptz,
  unique (tenant_id, period_start)
);

create table if not exists mfg_period_adjust (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  period_id uuid not null references mfg_periods(id) on delete cascade,
  key       text not null check (key in ('WIP', 'FG_INVENTORY')),
  amount    numeric(18, 2) not null
);
create index if not exists mfg_period_adjust_idx on mfg_period_adjust (tenant_id, period_id);

alter table mfg_periods enable row level security;
alter table mfg_period_adjust enable row level security;
do $$
declare t text;
begin
  foreach t in array array['mfg_periods', 'mfg_period_adjust'] loop
    execute format('drop policy if exists "mfg read" on %I', t);
    execute format($f$create policy "mfg read" on %I for select
      using ((tenant_id = my_tenant_id() or is_teacher()) and tenant_edition(tenant_id) = 'MANUFACTURING')$f$, t);
  end loop;
end $$;

-- ---------- small helpers (internal) ----------
-- Debits less credits on a set of accounts between two dates (a null bound is open).
create or replace function mfg__bal(p_tenant uuid, p_accs uuid[], p_from date, p_to date)
returns numeric as $$
  select coalesce(sum(jl.debit - jl.credit), 0)
    from journal_lines jl join journal_entries je on je.id = jl.journal_entry_id
   where je.tenant_id = p_tenant and jl.account_id = any (p_accs)
     and (p_from is null or je.entry_date >= p_from) and (p_to is null or je.entry_date <= p_to);
$$ language sql stable security definer set search_path = public;

create or replace function mfg__acc_keys(p_tenant uuid, p_keys text[])
returns uuid[] as $$
  select coalesce(array_agg(distinct account_id), '{}'::uuid[]) from mfg_account_determination where tenant_id = p_tenant and key = any (p_keys);
$$ language sql stable security definer set search_path = public;

-- A signed amount as one posting line: positive is a debit, negative a credit, zero nothing.
create or replace function mfg__line(p_acc uuid, p_amount numeric)
returns jsonb as $$
  select case when p_amount > 0 then jsonb_build_object('account_id', p_acc, 'debit', p_amount, 'credit', 0)
              when p_amount < 0 then jsonb_build_object('account_id', p_acc, 'debit', 0, 'credit', -p_amount) end;
$$ language sql immutable set search_path = public;

-- ---------- what settling a month would post ----------
create or replace function mfg__period_plan(p_tenant uuid, p_start date)
returns jsonb as $$
declare
  v_start date := date_trunc('month', p_start)::date;
  v_end date := (date_trunc('month', p_start) + interval '1 month' - interval '1 day')::date;
  st mfg_company_settings;
  a_lab uuid := mfg_account(p_tenant, 'APPLIED_LABOR');
  a_rate uuid := mfg_account(p_tenant, 'LABOR_RATE_VAR');
  a_pay uuid := mfg_account(p_tenant, 'PAYROLL_EXPENSE');
  a_wip uuid := mfg_account(p_tenant, 'WIP');
  a_fg uuid := mfg_account(p_tenant, 'FG_INVENTORY');
  a_cogs uuid := mfg_account(p_tenant, 'COGS');
  l_h numeric := 0; l_app numeric := 0; l_act numeric := 0; l_var numeric := 0;
  lab_lines jsonb := '[]'::jsonb; close_lines jsonb := '[]'::jsonb; vars jsonb := '[]'::jsonb;
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
    amt := round(mfg__bal(p_tenant, array[r.account_id], null, v_end) + case when r.account_id = a_rate then l_var else 0 end, 2);
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
    'labor_lines', lab_lines, 'variances', vars, 'close_lines', close_lines,
    'to_wip', tot_w, 'to_fg', tot_f, 'to_cogs', tot_c,
    'bases', jsonb_build_object('wip', wb, 'fg', fb, 'cogs', cb),
    'methods', jsonb_build_object('variance', st.variance_close_method, 'overhead', st.oh_close_method));
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- checks before settling ----------
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

-- ---------- the list of months ----------
create or replace function mfg_period_list(p_tenant uuid)
returns table (period_start date, period_end date, status text, entries int, settled_at timestamptz, closed_at timestamptz, to_cogs numeric, to_wip numeric, to_fg numeric) as $$
declare
  v_first date; v_last date;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  select date_trunc('month', min(entry_date))::date, date_trunc('month', max(entry_date))::date into v_first, v_last from journal_entries where tenant_id = p_tenant;
  v_first := least(coalesce(v_first, date_trunc('month', current_date)::date), date_trunc('month', current_date)::date);
  v_first := greatest(v_first, (date_trunc('month', current_date) - interval '35 months')::date);
  v_last := greatest(coalesce(v_last, date_trunc('month', current_date)::date), date_trunc('month', current_date)::date);
  return query
  select g::date, (g + interval '1 month' - interval '1 day')::date, coalesce(p.status, 'OPEN')::text,
         (select count(*)::int from journal_entries je where je.tenant_id = p_tenant and je.entry_date >= g::date and je.entry_date < (g + interval '1 month')::date),
         p.settled_at, p.closed_at,
         coalesce((p.detail->>'to_cogs')::numeric, 0), coalesce((p.detail->>'to_wip')::numeric, 0), coalesce((p.detail->>'to_fg')::numeric, 0)
    from generate_series(v_first, v_last, interval '1 month') g
    left join mfg_periods p on p.tenant_id = p_tenant and p.period_start = g::date
   order by g desc;
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
            select 'variances'::text, t.ord + 100, t.l from jsonb_array_elements(plan->'close_lines') with ordinality t(l, ord)) s
      join accounts a on a.id = (s.l->>'account_id')::uuid
     order by s.ord
  loop
    disp := disp || jsonb_build_object('entry', e.entry, 'code', e.code, 'name', e.name, 'debit', e.debit, 'credit', e.credit);
  end loop;
  return plan || jsonb_build_object('display', disp);
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- settle ----------
create or replace function mfg_settle_period(p_start date, p_note text default null)
returns uuid as $$
declare
  v_t uuid := mfg__my_tenant();
  v_start date; v_end date; v_id uuid := gen_random_uuid(); plan jsonb; je1 uuid; je2 uuid; m text;
begin
  if p_start is null then raise exception 'Choose a month.'; end if;
  v_start := date_trunc('month', p_start)::date;
  v_end := (date_trunc('month', p_start) + interval '1 month' - interval '1 day')::date;
  select c.message into m from mfg_period_checks(v_t, v_start) c where c.severity = 'block' order by c.code limit 1;
  if m is not null then raise exception '%', m; end if;
  plan := mfg__period_plan(v_t, v_start);
  insert into mfg_periods (id, tenant_id, period_start, period_end, status, detail, note, settled_by)
  values (v_id, v_t, v_start, v_end, 'SETTLED', plan, nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  if jsonb_array_length(plan->'labor_lines') > 0 then
    je1 := mfg__post_entry(v_t, v_end, 'Month end ' || to_char(v_start, 'Mon YYYY') || ': production labor at the real wage rate', 'mfg_periods', v_id, plan->'labor_lines');
  end if;
  if jsonb_array_length(plan->'close_lines') > 0 then
    je2 := mfg__post_entry(v_t, v_end, 'Month end ' || to_char(v_start, 'Mon YYYY') || ': variances closed', 'mfg_periods', v_id, plan->'close_lines');
  end if;
  update mfg_periods set labor_je = je1, close_je = je2 where id = v_id;
  if (plan->>'to_wip')::numeric <> 0 then insert into mfg_period_adjust (tenant_id, period_id, key, amount) values (v_t, v_id, 'WIP', (plan->>'to_wip')::numeric); end if;
  if (plan->>'to_fg')::numeric <> 0 then insert into mfg_period_adjust (tenant_id, period_id, key, amount) values (v_t, v_id, 'FG_INVENTORY', (plan->>'to_fg')::numeric); end if;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'period_settled', jsonb_build_object('period', to_char(v_start, 'YYYY-MM'), 'labor_variance', plan->'labor'->'variance',
          'variances_closed', (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(plan->'variances') x)), auth.uid());
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- undo a settlement (not yet closed) ----------
create or replace function mfg__period_reverse(p_tenant uuid, p_period mfg_periods, p_reason text)
returns void as $$
begin
  perform mfg__reverse_entry(p_tenant, p_period.labor_je, p_period.period_end, 'Reversal of month end ' || to_char(p_period.period_start, 'Mon YYYY') || ' (labor)', 'mfg_periods', p_period.id);
  perform mfg__reverse_entry(p_tenant, p_period.close_je, p_period.period_end, 'Reversal of month end ' || to_char(p_period.period_start, 'Mon YYYY') || ' (variances)', 'mfg_periods', p_period.id);
  delete from mfg_period_adjust where period_id = p_period.id;
  delete from mfg_periods where id = p_period.id;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (p_tenant, 'period_reopened', jsonb_build_object('period', to_char(p_period.period_start, 'YYYY-MM'), 'reason', p_reason, 'was', p_period.status), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function mfg_undo_period_settlement(p_start date, p_reason text)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  p mfg_periods;
begin
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are undoing it — the reason stays on the record.'; end if;
  select * into p from mfg_periods where tenant_id = v_t and period_start = date_trunc('month', p_start)::date for update;
  if p.id is null then raise exception 'That month has not been settled.'; end if;
  if p.status = 'CLOSED' then raise exception 'That month is closed. Only your teacher can re-open a closed month.'; end if;
  perform mfg__period_reverse(v_t, p, trim(p_reason));
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- close: lock the books through the month end ----------
create or replace function mfg_close_period(p_start date)
returns void as $$
declare
  v_t uuid := mfg__my_tenant();
  p mfg_periods; v_lock date;
begin
  select * into p from mfg_periods where tenant_id = v_t and period_start = date_trunc('month', p_start)::date for update;
  if p.id is null then raise exception 'Settle the month first — closing comes after the month-end entries.'; end if;
  if p.status = 'CLOSED' then raise exception 'That month is already closed.'; end if;
  if exists (select 1 from mfg_periods x where x.tenant_id = v_t and x.period_start < p.period_start and x.status <> 'CLOSED') then
    raise exception 'An earlier month is settled but not closed. Close the months in order.';
  end if;
  select books_locked_through into v_lock from tenants where id = v_t;
  update tenants set books_locked_through = greatest(p.period_end, coalesce(v_lock, p.period_end)) where id = v_t;
  update mfg_periods set status = 'CLOSED', prior_lock = v_lock, closed_by = auth.uid(), closed_at = now() where id = p.id;
  insert into mfg_audit_log (tenant_id, event, detail, created_by)
  values (v_t, 'period_closed', jsonb_build_object('period', to_char(p.period_start, 'YYYY-MM'), 'locked_through', p.period_end), auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- re-open (teacher only, the latest closed month) ----------
create or replace function mfg_reopen_period(p_tenant uuid, p_start date, p_reason text)
returns void as $$
declare
  p mfg_periods;
begin
  if auth.uid() is null or is_teacher() is not true then raise exception 'Only the teacher can re-open a closed month.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why you are re-opening it — the reason stays on the record.'; end if;
  select * into p from mfg_periods where tenant_id = p_tenant and period_start = date_trunc('month', p_start)::date for update;
  if p.id is null then raise exception 'That month has not been settled or closed.'; end if;
  if exists (select 1 from mfg_periods x where x.tenant_id = p_tenant and x.period_start > p.period_start) then
    raise exception 'A later month is settled or closed. Re-open the later months first.';
  end if;
  if p.status = 'CLOSED' then
    update tenants set books_locked_through = case when p.prior_lock is null then null
                                                  when p.prior_lock >= p.period_start then p.period_start - 1
                                                  else p.prior_lock end
     where id = p_tenant;
  end if;
  perform mfg__period_reverse(p_tenant, p, trim(p_reason));
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- statement of cost of goods manufactured ----------
create or replace function mfg_cogm(p_tenant uuid, p_from date, p_to date)
returns jsonb as $$
declare
  rm uuid[]; wip uuid[]; fg uuid[]; cg uuid[];
  rm_beg numeric; rm_end numeric; purch numeric; used_l numeric; used_d numeric; lab numeric; mach numeric; fix numeric; total numeric;
  wip_beg numeric; wip_end numeric; alloc_w numeric; alloc_f numeric; alloc_c numeric; wip_end_b numeric; fg_beg numeric; fg_end numeric; fg_end_b numeric;
  relief numeric; written numeric; cogm numeric; to_fg numeric; cogs_l numeric; cogs_pre numeric; derived numeric;
  lines jsonb := '[]'::jsonb; cogs_lines jsonb := '[]'::jsonb; checks jsonb := '[]'::jsonb;
  w_calc numeric;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose the dates to report on.'; end if;
  rm := mfg__acc_keys(p_tenant, array['RM_INVENTORY', 'PACKAGING_INVENTORY']);
  wip := mfg__acc_keys(p_tenant, array['WIP']);
  fg := mfg__acc_keys(p_tenant, array['FG_INVENTORY']);
  cg := mfg__acc_keys(p_tenant, array['COGS']);

  -- from the ledger
  rm_beg := mfg__bal(p_tenant, rm, null, p_from - 1);
  rm_end := mfg__bal(p_tenant, rm, null, p_to);
  select coalesce(sum(jl.debit - jl.credit), 0) into purch
    from journal_lines jl join journal_entries je on je.id = jl.journal_entry_id
    left join mfg_material_documents d on je.source_table = 'mfg_material_documents' and d.id = je.source_id
    left join mfg_material_documents o on o.id = d.reversal_of
   where je.tenant_id = p_tenant and jl.account_id = any (rm) and je.entry_date between p_from and p_to
     and not (coalesce(d.doc_type = 'GI', false) or coalesce(d.doc_type = 'REV' and o.doc_type = 'GI', false));
  used_l := rm_beg + purch - rm_end;
  wip_beg := mfg__bal(p_tenant, wip, null, p_from - 1);
  wip_end := mfg__bal(p_tenant, wip, null, p_to);
  select coalesce(sum(a.amount), 0) into alloc_w from mfg_period_adjust a join mfg_periods p on p.id = a.period_id
   where a.tenant_id = p_tenant and a.key = 'WIP' and p.period_start >= date_trunc('month', p_from)::date and p.period_start <= p_to;
  select coalesce(sum(a.amount), 0) into alloc_f from mfg_period_adjust a join mfg_periods p on p.id = a.period_id
   where a.tenant_id = p_tenant and a.key = 'FG_INVENTORY' and p.period_start >= date_trunc('month', p_from)::date and p.period_start <= p_to;
  select coalesce(sum((p.detail->>'to_cogs')::numeric), 0) into alloc_c from mfg_periods p
   where p.tenant_id = p_tenant and p.period_start >= date_trunc('month', p_from)::date and p.period_start <= p_to;
  wip_end_b := wip_end - alloc_w;
  fg_beg := mfg__bal(p_tenant, fg, null, p_from - 1);
  fg_end := mfg__bal(p_tenant, fg, null, p_to);
  fg_end_b := fg_end - alloc_f;

  -- from the production documents (order costs)
  select coalesce(sum(amount) filter (where element = 'MATERIAL'), 0),
         coalesce(sum(amount) filter (where element = 'LABOR'), 0),
         coalesce(sum(amount) filter (where element in ('MACHINE', 'VAR_OH')), 0),
         coalesce(sum(amount) filter (where element = 'FIX_OH'), 0),
         coalesce(-sum(amount) filter (where element = 'RELIEF'), 0),
         coalesce(-sum(amount) filter (where element = 'VARIANCE'), 0)
    into used_d, lab, mach, fix, relief, written
    from mfg_order_costs where tenant_id = p_tenant and posting_date between p_from and p_to;

  total := used_l + lab + mach + fix;
  cogm := total + wip_beg - wip_end_b;
  to_fg := cogm - written;

  lines := jsonb_build_array(
    jsonb_build_object('key', 'rm_beg', 'label', 'Raw materials and packaging, beginning', 'amount', rm_beg, 'kind', 'line', 'source', 'ledger'),
    jsonb_build_object('key', 'purch', 'label', 'Add: purchases and other net additions', 'amount', purch, 'kind', 'line', 'source', 'ledger',
                       'note', 'Goods received, landed costs, returns, scrap and counts — everything that moved the stock accounts except issues to production.'),
    jsonb_build_object('key', 'rm_end', 'label', 'Less: raw materials and packaging, ending', 'amount', -rm_end, 'kind', 'line', 'source', 'ledger'),
    jsonb_build_object('key', 'used', 'label', 'Direct materials used', 'amount', used_l, 'kind', 'sub', 'source', 'ledger'),
    jsonb_build_object('key', 'labor', 'label', 'Direct labor', 'amount', lab, 'kind', 'line', 'source', 'documents'),
    jsonb_build_object('key', 'mach', 'label', 'Machine and variable overhead applied', 'amount', mach, 'kind', 'line', 'source', 'documents'),
    jsonb_build_object('key', 'fix', 'label', 'Fixed overhead applied', 'amount', fix, 'kind', 'line', 'source', 'documents'),
    jsonb_build_object('key', 'total', 'label', 'Total manufacturing cost', 'amount', total, 'kind', 'sub', 'source', 'ledger'),
    jsonb_build_object('key', 'wip_beg', 'label', 'Add: work in process, beginning', 'amount', wip_beg, 'kind', 'line', 'source', 'ledger'),
    jsonb_build_object('key', 'wip_end', 'label', 'Less: work in process, ending', 'amount', -wip_end_b, 'kind', 'line', 'source', 'ledger',
                       'note', 'Before any month-end allocation of variances to work in process.'),
    jsonb_build_object('key', 'cogm', 'label', 'Cost of goods manufactured, before variances', 'amount', cogm, 'kind', 'sub', 'source', 'ledger'),
    jsonb_build_object('key', 'written', 'label', 'Less: variances written off when orders were settled', 'amount', -written, 'kind', 'line', 'source', 'documents'),
    jsonb_build_object('key', 'to_fg', 'label', 'Transferred to finished goods', 'amount', to_fg, 'kind', 'total', 'source', 'ledger'));

  w_calc := wip_beg + (used_d + lab + mach + fix) - relief - written;
  checks := jsonb_build_array(
    jsonb_build_object('key', 'materials', 'label', 'Materials used: the stock accounts agree with the material issues on the orders',
                       'a', used_l, 'b', used_d, 'diff', round(used_l - used_d, 2)),
    jsonb_build_object('key', 'wip', 'label', 'Work in process: beginning + cost added − goods received − variances written off = ending',
                       'a', w_calc, 'b', wip_end_b, 'diff', round(w_calc - wip_end_b, 2)),
    jsonb_build_object('key', 'received', 'label', 'Transferred to finished goods agrees with the finished-goods receipts',
                       'a', to_fg, 'b', relief, 'diff', round(to_fg - relief, 2)));

  -- cost of goods sold
  select coalesce(sum(jl.debit - jl.credit), 0) into cogs_l
    from journal_lines jl join journal_entries je on je.id = jl.journal_entry_id
   where je.tenant_id = p_tenant and jl.account_id = any (cg) and je.entry_date between p_from and p_to;
  cogs_pre := cogs_l - alloc_c;
  derived := fg_beg + to_fg - fg_end_b;
  cogs_lines := jsonb_build_array(
    jsonb_build_object('key', 'fg_beg', 'label', 'Finished goods, beginning', 'amount', fg_beg, 'kind', 'line'),
    jsonb_build_object('key', 'fg_in', 'label', 'Add: transferred to finished goods', 'amount', to_fg, 'kind', 'line'),
    jsonb_build_object('key', 'fg_end', 'label', 'Less: finished goods, ending', 'amount', -fg_end_b, 'kind', 'line'),
    jsonb_build_object('key', 'derived', 'label', 'Cost of goods sold implied by the stock movement', 'amount', derived, 'kind', 'sub'),
    jsonb_build_object('key', 'other', 'label', 'Other (scrap and counts from stock, by-products, returns)', 'amount', cogs_pre - derived, 'kind', 'line'),
    jsonb_build_object('key', 'cogs_pre', 'label', 'Cost of goods sold, before the month-end variance close', 'amount', cogs_pre, 'kind', 'sub'),
    jsonb_build_object('key', 'close', 'label', 'Add: variances closed to cost of goods sold', 'amount', alloc_c, 'kind', 'line'),
    jsonb_build_object('key', 'cogs', 'label', 'Cost of goods sold per the ledger', 'amount', cogs_l, 'kind', 'total'));

  return jsonb_build_object('from', p_from, 'to', p_to, 'lines', lines, 'checks', checks, 'cogs', cogs_lines,
                            'allocated', jsonb_build_object('wip', alloc_w, 'fg', alloc_f, 'cogs', alloc_c));
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- the books check also knows about month-end allocations to inventory ----------
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
  ), adj as (
    select a.key, coalesce(sum(a.amount), 0) as amt from mfg_period_adjust a where a.tenant_id = t group by a.key
  ), stock as (
    select mfg__inv_key(m.item_type) as key,
           coalesce(sum(s.qty * case when v_method = 'STANDARD' then m.standard_cost else m.moving_avg_cost end), 0) as val
      from mfg_stock s join mfg_item_master m on m.item_id = s.item_id where s.tenant_id = t group by 1
  ), pairs(a_name, a_key) as (values ('Raw materials', 'RM_INVENTORY'), ('Packaging & supplies', 'PACKAGING_INVENTORY'), ('Finished goods', 'FG_INVENTORY')),
  grir as (
    select coalesce((select sum(dl.qty_change * pl.unit_cost) from mfg_material_doc_lines dl join purchase_order_lines pl on pl.id = dl.po_line_id where dl.tenant_id = t), 0)
         - coalesce((select sum(round(vl.qty * vl.po_price, 2)) from mfg_vendor_invoice_lines vl join mfg_vendor_invoices vi on vi.id = vl.invoice_id
                      where vl.tenant_id = t and vi.status = 'POSTED'), 0) as val
  ), ap as (
    select coalesce((select sum(b.total) from bills b where b.tenant_id = t and b.status = 'received'), 0)
         - coalesce((select sum(p.amount) from bill_payments p join bills b on b.id = p.bill_id where b.tenant_id = t and b.status = 'received'), 0) as val
  )
  select p.a_name, k.code, k.name,
         round(coalesce(s.val, 0) + coalesce((select amt from adj where adj.key = p.a_key), 0), 2), round(k.bal, 2),
         round(coalesce(s.val, 0) + coalesce((select amt from adj where adj.key = p.a_key), 0) - k.bal, 2)
    from pairs p join keyed k on k.key = p.a_key left join stock s on s.key = p.a_key
  union all
  select 'Work in process', k.code, k.name,
         round(coalesce((select sum(amount) from mfg_order_costs where tenant_id = t), 0) + coalesce((select amt from adj where adj.key = 'WIP'), 0), 2), round(k.bal, 2),
         round(coalesce((select sum(amount) from mfg_order_costs where tenant_id = t), 0) + coalesce((select amt from adj where adj.key = 'WIP'), 0) - k.bal, 2)
    from keyed k where k.key = 'WIP'
  union all
  select 'Received, not yet invoiced (GR/IR)', k.code, k.name, round((select val from grir), 2), round(-k.bal, 2), round((select val from grir) + k.bal, 2)
    from keyed k where k.key = 'GR_IR'
  union all
  select 'Accounts payable', g.code, g.name, round((select val from ap), 2), round(-g.bal, 2), round((select val from ap) + g.bal, 2)
    from gl_bal g where g.code = '2000';
end;
$$ language plpgsql stable set search_path = public;

-- ---------- who may call what ----------
revoke execute on function mfg__bal(uuid, uuid[], date, date) from public, anon, authenticated;
revoke execute on function mfg__acc_keys(uuid, text[]) from public, anon, authenticated;
revoke execute on function mfg__line(uuid, numeric) from public, anon, authenticated;
revoke execute on function mfg__period_plan(uuid, date) from public, anon, authenticated;
revoke execute on function mfg__period_reverse(uuid, mfg_periods, text) from public, anon, authenticated;
revoke execute on function mfg_period_checks(uuid, date) from public, anon;
revoke execute on function mfg_period_list(uuid) from public, anon;
revoke execute on function mfg_period_preview(uuid, date) from public, anon;
revoke execute on function mfg_settle_period(date, text) from public, anon;
revoke execute on function mfg_undo_period_settlement(date, text) from public, anon;
revoke execute on function mfg_close_period(date) from public, anon;
revoke execute on function mfg_reopen_period(uuid, date, text) from public, anon;
revoke execute on function mfg_cogm(uuid, date, date) from public, anon;
revoke execute on function mfg_reconciliation(uuid) from public, anon;
grant execute on function mfg_period_checks(uuid, date) to authenticated;
grant execute on function mfg_period_list(uuid) to authenticated;
grant execute on function mfg_period_preview(uuid, date) to authenticated;
grant execute on function mfg_settle_period(date, text) to authenticated;
grant execute on function mfg_undo_period_settlement(date, text) to authenticated;
grant execute on function mfg_close_period(date) to authenticated;
grant execute on function mfg_reopen_period(uuid, date, text) to authenticated;
grant execute on function mfg_cogm(uuid, date, date) to authenticated;
grant execute on function mfg_reconciliation(uuid) to authenticated;
