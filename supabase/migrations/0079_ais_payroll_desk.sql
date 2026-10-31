-- ============================================================
-- Classroom ERP — migration 0079 (AIS edition: the Payroll desk, the payroll-cycle workbench)
--
-- Needs 0076-0078. Adds new tables and functions and five finding types; nothing existing is altered.
--
-- Ten cards for the January 2027 payroll: eight timekeeping and master-file inputs, then the payroll run.
--   1 CHECK each input against the HR master file and its approvals (employee on file? still employed? hours possible? overtime approved? pay-rate change approved?)
--   2 APPROVE or REJECT what the check holds (whoever ran the check cannot approve unless the company allows solo work)
--   3 POST the payroll: one voucher per employee (Dr Payroll Expense and employer share, Cr SSS / PhilHealth / Pag-IBIG / withholding tax payable and net pay payable)
--   4 PAY the net pay (Dr Net Pay Payable, Cr Cash)
-- Hidden in the cards: overtime nobody approved, a pay-rate jump with no approved personnel action, a timecard for a person who is not on the HR file (a ghost
-- employee), a timecard for someone who resigned, and 310 hours claimed in one month. An exception the student approves for themselves is planted for the Audit seat.
-- Contributions are simplified classroom rates, not the legal tables. Answers are in ais_pr_task_keys (no policy).
-- ROLLBACK: drop table if exists ais_pr_task_keys, ais_pr_tasks, ais_pr_employees; drop the ais_pr_* functions; delete the five finding types added below.
-- ============================================================

create table if not exists ais_pr_employees (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  code text not null, name text not null, monthly_rate numeric(14,2) not null, active boolean not null default true, rate_flag boolean not null default false
);
create index if not exists ais_pr_employees_tenant on ais_pr_employees (tenant_id);

create table if not exists ais_pr_tasks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  seq int not null, kind text not null check (kind in ('TIME', 'RATE_CHANGE', 'RUN')),
  employee_id uuid references ais_pr_employees(id) on delete cascade, emp_name text not null,
  ghost_rate numeric(14,2),                                              -- the monthly rate on a timecard for someone who is not on the HR file
  hours numeric(8,2), ot_hours numeric(8,2), ot_approved boolean, new_rate numeric(14,2), form_attached boolean, note text,
  state text not null default 'NEW' check (state in ('NEW', 'CLEAN', 'HELD', 'ACCEPTED', 'REJECTED', 'POSTED', 'PAID', 'DONE')),
  flag_tag text, flag_text text, checked_by uuid, approved_by uuid, self_approved boolean not null default false, decision_note text,
  gross numeric(14,2), deductions numeric(14,2), net numeric(14,2), entry_id uuid,
  unique (tenant_id, seq)
);
create table if not exists ais_pr_task_keys (task_id uuid primary key references ais_pr_tasks(id) on delete cascade, trap text, why text not null);

alter table ais_pr_employees enable row level security; alter table ais_pr_tasks enable row level security; alter table ais_pr_task_keys enable row level security;

insert into ais_finding_types (tag, label, category) values
  ('GHOST_EMPLOYEE',      'Pay to a person who is not on the HR master file', 'Master data / authorization'),
  ('TERMINATED_PAID',     'Pay to an employee who has left',                  'Master data / authorization'),
  ('IMPLAUSIBLE_HOURS',   'Hours claimed are not plausible',                   'Accuracy'),
  ('UNAUTH_OVERTIME',     'Overtime paid without an approved overtime slip',   'Transaction authorization'),
  ('UNAUTH_RATE',         'Pay rate changed without an approved personnel action', 'Transaction authorization')
on conflict (tag) do nothing;

create or replace function ais__pr_seed(p_tenant uuid)
returns void as $$
declare
  e_a uuid; e_b uuid; e_c uuid; e_d uuid; e_e uuid; e_f uuid; e_g uuid; t uuid;
begin
  if exists (select 1 from ais_pr_employees where tenant_id = p_tenant) then return; end if;
  insert into ais_pr_employees (tenant_id, code, name, monthly_rate) values (p_tenant, 'E-01', 'Maria Reyes', 30000) returning id into e_a;
  insert into ais_pr_employees (tenant_id, code, name, monthly_rate) values (p_tenant, 'E-02', 'Jose Santos', 28000) returning id into e_b;
  insert into ais_pr_employees (tenant_id, code, name, monthly_rate) values (p_tenant, 'E-03', 'Ana Dizon', 35000) returning id into e_c;
  insert into ais_pr_employees (tenant_id, code, name, monthly_rate) values (p_tenant, 'E-04', 'Paolo Lim', 25000) returning id into e_d;
  insert into ais_pr_employees (tenant_id, code, name, monthly_rate) values (p_tenant, 'E-05', 'Liza Cruz', 40000) returning id into e_e;
  insert into ais_pr_employees (tenant_id, code, name, monthly_rate, active) values (p_tenant, 'E-06', 'Ramon Mendoza', 32000, false) returning id into e_f;
  insert into ais_pr_employees (tenant_id, code, name, monthly_rate) values (p_tenant, 'E-07', 'Grace Tan', 26000) returning id into e_g;

  insert into ais_pr_tasks (tenant_id, seq, kind, employee_id, emp_name, hours, ot_hours, note) values (p_tenant, 1, 'TIME', e_a, 'Maria Reyes', 160, 0, 'Approved timecard, signed by the supervisor.') returning id into t;
  insert into ais_pr_task_keys values (t, null, 'A normal timecard for an employee on file. Check it, accept it, and it will be paid.');
  insert into ais_pr_tasks (tenant_id, seq, kind, employee_id, emp_name, hours, ot_hours) values (p_tenant, 2, 'TIME', e_b, 'Jose Santos', 160, 0) returning id into t;
  insert into ais_pr_task_keys values (t, null, 'A normal timecard.');
  insert into ais_pr_tasks (tenant_id, seq, kind, employee_id, emp_name, hours, ot_hours, ot_approved, note) values (p_tenant, 3, 'TIME', e_c, 'Ana Dizon', 160, 10, true, '10 hours of overtime. An approved overtime slip is stapled to the card.') returning id into t;
  insert into ais_pr_task_keys values (t, null, 'Overtime with an approved overtime slip is paid at 125%. Nothing is wrong here.');
  insert into ais_pr_tasks (tenant_id, seq, kind, employee_id, emp_name, hours, ot_hours, ot_approved, note) values (p_tenant, 4, 'TIME', e_d, 'Paolo Lim', 160, 45, false, '45 hours of overtime. There is no overtime slip with the card.') returning id into t;
  insert into ais_pr_task_keys values (t, 'UNAUTH_OVERTIME', '45 hours of overtime with no approved overtime slip. Overtime is paid only when a manager approved it in advance; without the slip the extra pay is unauthorized.');
  insert into ais_pr_tasks (tenant_id, seq, kind, employee_id, emp_name, new_rate, form_attached, note) values (p_tenant, 5, 'RATE_CHANGE', e_e, 'Liza Cruz', 62000, false, 'The department head asks for Liza Cruz''s pay to go from 40,000 to 62,000. There is no personnel action form.') returning id into t;
  insert into ais_pr_task_keys values (t, 'UNAUTH_RATE', 'A 55% raise with no approved personnel action form. Pay rates change only through an approved form from HR, otherwise anyone could raise their own pay.');
  insert into ais_pr_tasks (tenant_id, seq, kind, employee_id, emp_name, hours, ot_hours, note) values (p_tenant, 6, 'TIME', e_e, 'Liza Cruz', 160, 0, 'Her normal timecard for the month.') returning id into t;
  insert into ais_pr_task_keys values (t, null, 'A normal timecard. Its pay depends on what you did with the rate change on card 5.');
  insert into ais_pr_tasks (tenant_id, seq, kind, employee_id, emp_name, ghost_rate, hours, ot_hours, note) values (p_tenant, 7, 'TIME', null, 'R. Villar', 28000, 160, 0, 'A timecard signed by the warehouse supervisor for "R. Villar". Nobody in HR has a file for this name.') returning id into t;
  insert into ais_pr_task_keys values (t, 'GHOST_EMPLOYEE', 'There is no HR record for this person: a possible ghost employee. Pay goes only to people on the HR master file, who have been hired through HR, and never on a supervisor''s word alone.');
  insert into ais_pr_tasks (tenant_id, seq, kind, employee_id, emp_name, hours, ot_hours, note) values (p_tenant, 8, 'TIME', e_f, 'Ramon Mendoza', 160, 0, 'A full-month timecard for Ramon Mendoza, submitted by his old supervisor.') returning id into t;
  insert into ais_pr_task_keys values (t, 'TERMINATED_PAID', 'Ramon Mendoza resigned in December and is marked inactive in the HR file. Paying a full month to someone who has left is a classic payroll fraud.');
  insert into ais_pr_tasks (tenant_id, seq, kind, employee_id, emp_name, hours, ot_hours, note) values (p_tenant, 9, 'TIME', e_g, 'Grace Tan', 310, 0, 'The card claims 310 regular hours in one month.') returning id into t;
  insert into ais_pr_task_keys values (t, 'IMPLAUSIBLE_HOURS', 'There are only about 720 hours in a month and a normal month is around 160. 310 regular hours is not plausible and needs the supervisor to correct or explain it before anyone is paid for it.');
  insert into ais_pr_tasks (tenant_id, seq, kind, emp_name, note) values (p_tenant, 10, 'RUN', 'January 2027 payroll', 'When every card above is decided: post the payroll vouchers, then pay the net pay.') returning id into t;
  insert into ais_pr_task_keys values (t, null, 'Post the vouchers once every card is decided, then pay the net pay.');
end;
$$ language plpgsql security definer set search_path = public;

-- contributions and tax (simplified classroom rates)
create or replace function ais__pr_calc(p_gross numeric)
returns jsonb as $$
declare
  sss_ee numeric := least(1350, round(p_gross * 0.045, 2)); sss_er numeric := least(2850, round(p_gross * 0.095, 2)); ph numeric := round(p_gross * 0.025, 2); pag numeric := 100;
  taxable numeric; wht numeric;
begin
  taxable := p_gross - sss_ee - ph - pag;
  wht := round(greatest(0, taxable - 20833) * 0.15, 2);
  return jsonb_build_object('sss_ee', sss_ee, 'sss_er', sss_er, 'ph', ph, 'pag', pag, 'wht', wht,
    'er_total', sss_er + ph + pag, 'ee_total', sss_ee + ph + pag + wht, 'net', p_gross - sss_ee - ph - pag - wht);
end;
$$ language plpgsql immutable set search_path = public;

create or replace function ais_pr_state()
returns jsonb as $$
declare
  c record; t uuid; res jsonb;
begin
  select * into c from ais__wb_context(false);
  t := c.tenant;
  perform ais__pr_seed(t);
  select jsonb_build_object(
    'phase', (select phase from ais_instances where id = c.inst), 'solo', c.solo,
    'employees', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'code', e.code, 'name', e.name, 'monthly_rate', e.monthly_rate, 'active', e.active) order by e.code), '[]'::jsonb) from ais_pr_employees e where e.tenant_id = t),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'seq', x.seq, 'kind', x.kind, 'employee_id', x.employee_id, 'emp_name', x.emp_name, 'on_file', x.employee_id is not null,
        'hours', x.hours, 'ot_hours', x.ot_hours, 'ot_approved', x.ot_approved, 'new_rate', x.new_rate, 'form_attached', x.form_attached, 'note', x.note, 'state', x.state, 'flag_text', x.flag_text,
        'checked_by_me', x.checked_by = auth.uid(), 'self_approved', x.self_approved, 'decision_note', x.decision_note, 'gross', x.gross, 'deductions', x.deductions, 'net', x.net,
        'current_rate', (select e.monthly_rate from ais_pr_employees e where e.id = x.employee_id)) order by x.seq), '[]'::jsonb) from ais_pr_tasks x where x.tenant_id = t)
  ) into res;
  return res;
end;
$$ language plpgsql volatile security definer set search_path = public;

-- ---------- step 1: check one input against the HR file and its approvals ----------
create or replace function ais_pr_check(p_task uuid)
returns jsonb as $$
declare
  c record; x ais_pr_tasks%rowtype; e ais_pr_employees%rowtype; tag text; why text;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_pr_tasks where id = p_task and tenant_id = c.tenant;
  if not found then raise exception 'That card does not belong to your company.'; end if;
  if x.kind = 'RUN' then raise exception 'The payroll run is not checked; use Post the payroll.'; end if;
  if x.state <> 'NEW' then raise exception 'This card has already been checked.'; end if;
  if x.employee_id is not null then select * into e from ais_pr_employees where id = x.employee_id; end if;
  if x.kind = 'TIME' then
    if x.employee_id is null then tag := 'GHOST_EMPLOYEE'; why := 'No one named ' || x.emp_name || ' is on the HR master file';
    elsif not e.active then tag := 'TERMINATED_PAID'; why := e.name || ' is marked inactive (resigned) in the HR file';
    elsif x.hours > 260 then tag := 'IMPLAUSIBLE_HOURS'; why := x.hours || ' regular hours in one month is not plausible (a normal month is about 160)';
    elsif x.ot_hours > 0 and not coalesce(x.ot_approved, false) then tag := 'UNAUTH_OVERTIME'; why := x.ot_hours || ' hours of overtime with no approved overtime slip'; end if;
  else
    if not coalesce(x.form_attached, false) then tag := 'UNAUTH_RATE'; why := 'The pay-rate change has no approved personnel action form (' || to_char(e.monthly_rate, 'FM999,999,990.00') || ' to ' || to_char(x.new_rate, 'FM999,999,990.00') || ')'; end if;
  end if;
  if tag is null then
    update ais_pr_tasks set state = 'CLEAN', checked_by = auth.uid() where id = x.id;
    if x.kind = 'RATE_CHANGE' then update ais_pr_employees set monthly_rate = x.new_rate where id = x.employee_id; end if;
  else
    update ais_pr_tasks set state = 'HELD', checked_by = auth.uid(), flag_tag = tag, flag_text = why where id = x.id;
  end if;
  return jsonb_build_object('ok', tag is null, 'reason', why);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_pr_approve(p_task uuid, p_reason text)
returns void as $$
declare
  c record; x ais_pr_tasks%rowtype; own boolean;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_pr_tasks where id = p_task and tenant_id = c.tenant;
  if not found then raise exception 'That card does not belong to your company.'; end if;
  if x.state <> 'HELD' then raise exception 'Only a card held by the check needs approval.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 10 then raise exception 'Write the reason for the approval (at least ten characters).'; end if;
  own := x.checked_by = auth.uid();
  if own and not c.solo then raise exception 'You ran the check on this card, so a different person must approve it (segregation of duties).'; end if;
  update ais_pr_tasks set state = 'ACCEPTED', approved_by = auth.uid(), self_approved = own, decision_note = trim(p_reason) where id = x.id;
  if x.kind = 'RATE_CHANGE' then update ais_pr_employees set monthly_rate = x.new_rate, rate_flag = own where id = x.employee_id; end if;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_pr_reject(p_task uuid, p_reason text)
returns void as $$
declare
  c record; x ais_pr_tasks%rowtype;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_pr_tasks where id = p_task and tenant_id = c.tenant;
  if not found then raise exception 'That card does not belong to your company.'; end if;
  if x.kind = 'RUN' then raise exception 'The payroll run cannot be rejected.'; end if;
  if x.state in ('REJECTED', 'POSTED', 'PAID') then raise exception 'This card can no longer be rejected.'; end if;
  if coalesce(length(trim(p_reason)), 0) < 10 then raise exception 'Write the reason for the rejection (at least ten characters).'; end if;
  update ais_pr_tasks set state = 'REJECTED', decision_note = trim(p_reason) where id = x.id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 3: post one payroll voucher per employee ----------
create or replace function ais_pr_post()
returns int as $$
declare
  c record; x record; e ais_pr_employees%rowtype; run ais_pr_tasks%rowtype; rate numeric; ot numeric; g numeric; cal jsonb; en uuid; n int := 0; undecided int;
  ptype text; inst uuid; pd date := date '2027-01-29';
begin
  select * into c from ais__wb_context(true);
  select * into run from ais_pr_tasks where tenant_id = c.tenant and kind = 'RUN';
  if run.state <> 'NEW' then raise exception 'The payroll has already been posted.'; end if;
  select count(*) into undecided from ais_pr_tasks where tenant_id = c.tenant and kind <> 'RUN' and state in ('NEW', 'HELD');
  if undecided > 0 then raise exception '% card(s) are not decided yet. Check each card and approve or reject what the check holds before posting the payroll.', undecided; end if;
  select id into inst from ais_instances where tenant_id = c.tenant;
  for x in select * from ais_pr_tasks where tenant_id = c.tenant and kind = 'TIME' and state in ('CLEAN', 'ACCEPTED') order by seq loop
    if x.employee_id is not null then select * into e from ais_pr_employees where id = x.employee_id; rate := e.monthly_rate; else e := null; rate := x.ghost_rate; end if;
    ot := round(coalesce(x.ot_hours, 0) * (rate / 160) * 1.25, 2);
    g := round(rate + ot, 2);
    cal := ais__pr_calc(g);
    en := ais__post_entry_src(c.tenant, pd, 'Payroll voucher January 2027 — ' || x.emp_name, 'ais_pr_tasks', x.id, jsonb_build_array(
      jsonb_build_object('acct', '5300', 'debit', g, 'credit', 0),
      jsonb_build_object('acct', '5310', 'debit', (cal ->> 'er_total')::numeric, 'credit', 0),
      jsonb_build_object('acct', '2100', 'debit', 0, 'credit', (cal ->> 'sss_ee')::numeric + (cal ->> 'sss_er')::numeric),
      jsonb_build_object('acct', '2110', 'debit', 0, 'credit', (cal ->> 'ph')::numeric * 2),
      jsonb_build_object('acct', '2120', 'debit', 0, 'credit', (cal ->> 'pag')::numeric * 2),
      jsonb_build_object('acct', '2130', 'debit', 0, 'credit', (cal ->> 'wht')::numeric),
      jsonb_build_object('acct', '2300', 'debit', 0, 'credit', (cal ->> 'net')::numeric)));
    update ais_pr_tasks set state = 'POSTED', gross = g, deductions = (cal ->> 'ee_total')::numeric, net = (cal ->> 'net')::numeric, entry_id = en where id = x.id;
    n := n + 1;
    -- planted for the Audit seat: an exception the student released on their own approval, or a raise they approved for themselves that is now being paid
    ptype := case when x.self_approved then x.flag_tag when e.rate_flag then 'UNAUTH_RATE' else null end;
    if ptype is not null and inst is not null then
      insert into ais_planted (instance_id, tenant_id, entry_id, type, detail) values (inst, c.tenant, en, ptype, jsonb_build_object('source', 'payroll', 'employee', x.emp_name, 'amount', g, 'self_approved', true));
    end if;
  end loop;
  update ais_pr_tasks set state = 'POSTED' where id = run.id;
  return n;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- step 4: pay the net pay ----------
create or replace function ais_pr_pay()
returns numeric as $$
declare
  c record; run ais_pr_tasks%rowtype; tot numeric;
begin
  select * into c from ais__wb_context(true);
  select * into run from ais_pr_tasks where tenant_id = c.tenant and kind = 'RUN';
  if run.state = 'NEW' then raise exception 'Post the payroll vouchers before paying the net pay.'; end if;
  if run.state <> 'POSTED' then raise exception 'The net pay has already been paid.'; end if;
  select coalesce(sum(net), 0) into tot from ais_pr_tasks where tenant_id = c.tenant and kind = 'TIME' and state = 'POSTED';
  if tot <= 0 then raise exception 'There is no net pay to pay.'; end if;
  perform ais__post_entry_src(c.tenant, date '2027-01-29', 'Payroll payment January 2027 (net pay to employees)', 'ais_pr_tasks', run.id,
    jsonb_build_array(jsonb_build_object('acct', '2300', 'debit', tot, 'credit', 0), jsonb_build_object('acct', '1000', 'debit', 0, 'credit', tot)));
  update ais_pr_tasks set state = 'PAID' where tenant_id = c.tenant and kind = 'TIME' and state = 'POSTED';
  update ais_pr_tasks set state = 'DONE', net = tot where id = run.id;
  return tot;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_pr_my_score()
returns jsonb as $$
declare
  c record; pts numeric := 0; mx numeric := 0; rws jsonb := '[]'::jsonb; x record; p numeric; msg text; rel boolean;
begin
  select * into c from ais__wb_context(false);
  if not ais__results_visible(c.inst) then return jsonb_build_object('visible', false); end if;
  for x in select t.*, k.trap, k.why from ais_pr_tasks t join ais_pr_task_keys k on k.task_id = t.id where t.tenant_id = c.tenant order by t.seq loop
    mx := mx + 6; p := 0;
    rel := x.state in ('CLEAN', 'ACCEPTED', 'POSTED', 'PAID');
    if x.kind = 'RUN' then
      p := case when x.state = 'DONE' then 6 else 0 end; msg := case when p = 6 then 'Posted and paid.' else 'The payroll was not completed.' end;
    elsif x.trap is null then
      p := case when x.state in ('CLEAN', 'POSTED', 'PAID') then 6 else 0 end;
      msg := case when p = 6 then 'Checked and paid.' when x.state = 'REJECTED' then 'Rejected, but this was a valid card.' else 'Not completed.' end;
    else
      if x.state = 'NEW' then p := 0; msg := 'You did not work this card. Stopping a bad item means looking at it and rejecting it.';
      elsif x.state = 'REJECTED' then p := 6; msg := 'Correct: you stopped it.';
      elsif rel and not x.self_approved and x.approved_by is not null then p := 3; msg := 'Released with a second person''s approval. The control worked, but check that it should have been released.';
      elsif rel then p := 0; msg := 'Released without a proper second approval.';
      else p := 3; msg := 'Left unfinished; it was not released.'; end if;
    end if;
    pts := pts + p;
    rws := rws || jsonb_build_object('seq', x.seq, 'ref_no', x.emp_name, 'points', p, 'max', 6, 'message', msg, 'why', x.why);
  end loop;
  return jsonb_build_object('visible', true, 'points', pts, 'max', mx, 'rows', rws);
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function ais__pr_seed(uuid), ais__pr_calc(numeric) from public, anon, authenticated;
revoke execute on function ais_pr_state(), ais_pr_check(uuid), ais_pr_approve(uuid, text), ais_pr_reject(uuid, text), ais_pr_post(), ais_pr_pay(), ais_pr_my_score() from public, anon;
grant execute on function ais_pr_state(), ais_pr_check(uuid), ais_pr_approve(uuid, text), ais_pr_reject(uuid, text), ais_pr_post(), ais_pr_pay(), ais_pr_my_score() to authenticated;
