-- ============================================================
-- Classroom ERP — migration 0080 (AIS edition: the Fixed Assets desk)
--
-- Needs 0076-0079. Adds new tables and functions, one finding type and (for each company, when its desk is first opened) the account 4100 Gain on Disposal of Assets.
--
-- Seven cards for January 2027:
--   1-5  five vendor invoices. The student decides CAPITALIZE (a fixed asset) or EXPENSE (this month's cost), using the company's policy: spend above 15,000 that
--        adds an asset or extends its life is capitalized; routine repairs and small items are expensed. The system posts what the student chose.
--        Capitalizing posts Dr Fixed Assets, Dr Input VAT, Cr Accounts Payable and adds the asset to the register. Expensing posts Dr Operating Expenses instead.
--   6    the January depreciation run (straight line, full month if in service by the 15th). The student runs it; the system computes it.
--   7    the sale of a fully depreciated forklift (gain on disposal). Needs the depreciation run first, so the asset is up to date at the sale.
-- A wrong capital-or-expense decision is planted for the Audit seat (CAPEX_ERROR). Answers are in ais_fa_task_keys (no policy).
-- ROLLBACK: drop table if exists ais_fa_task_keys, ais_fa_tasks, ais_fa_assets; drop the ais_fa_* functions; delete the CAPEX_ERROR finding type.
-- ============================================================

create table if not exists ais_fa_assets (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  code text not null, name text not null, cost numeric(14,2) not null, salvage numeric(14,2) not null default 0, life_months int not null,
  in_service date not null, acc_dep numeric(14,2) not null default 0, status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISPOSED'))
);
create index if not exists ais_fa_assets_tenant on ais_fa_assets (tenant_id);

create table if not exists ais_fa_tasks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  seq int not null, kind text not null check (kind in ('INVOICE', 'DEPRECIATION', 'DISPOSAL')),
  title text not null, vendor text, inv_no text, doc_date date not null, net numeric(14,2), life_months int, asset_id uuid references ais_fa_assets(id) on delete cascade, proceeds numeric(14,2), note text,
  state text not null default 'NEW' check (state in ('NEW', 'DONE')), decision text check (decision in ('CAPITALIZE', 'EXPENSE')), entry_id uuid,
  unique (tenant_id, seq)
);
create table if not exists ais_fa_task_keys (task_id uuid primary key references ais_fa_tasks(id) on delete cascade, correct text, why text not null);

alter table ais_fa_assets enable row level security; alter table ais_fa_tasks enable row level security; alter table ais_fa_task_keys enable row level security;

insert into ais_finding_types (tag, label, category) values ('CAPEX_ERROR', 'Capital and expense misclassified', 'Accuracy') on conflict (tag) do nothing;

create or replace function ais__fa_seed(p_tenant uuid)
returns void as $$
declare
  fk uuid; t uuid;
begin
  if exists (select 1 from ais_fa_assets where tenant_id = p_tenant) then return; end if;
  if not exists (select 1 from accounts where tenant_id = p_tenant and code = '4100') then
    insert into accounts (tenant_id, code, name, type, is_bank) values (p_tenant, '4100', 'Gain on Disposal of Assets', 'revenue', false);
  end if;
  -- the forklift bought in 2022 is already on the books: bring it in with an opening entry so the ledger carries its cost and depreciation
  insert into ais_fa_assets (tenant_id, code, name, cost, life_months, in_service, acc_dep) values (p_tenant, 'FA-001', 'Warehouse forklift (2022)', 478500, 60, date '2022-02-01', 470525) returning id into fk;
  perform ais__post_entry_src(p_tenant, date '2026-12-31', 'Opening balance — fixed assets brought forward', 'ais_fa_assets', fk,
    jsonb_build_array(jsonb_build_object('acct', '1500', 'debit', 478500, 'credit', 0), jsonb_build_object('acct', '1590', 'debit', 0, 'credit', 470525), jsonb_build_object('acct', '3000', 'debit', 0, 'credit', 7975)));

  insert into ais_fa_tasks (tenant_id, seq, kind, title, vendor, inv_no, doc_date, net, life_months, note) values (p_tenant, 1, 'INVOICE', 'Delivery truck', 'Isuzu Cabanatuan', 'FA-A-1101', date '2027-01-04', 1250000, 60, 'A new delivery truck for the business. It will last about five years.') returning id into t;
  insert into ais_fa_task_keys values (t, 'CAPITALIZE', 'A truck is used for years and costs far above the 15,000 policy limit: capitalize it and depreciate it over its life.');
  insert into ais_fa_tasks (tenant_id, seq, kind, title, vendor, inv_no, doc_date, net, life_months, note) values (p_tenant, 2, 'INVOICE', 'Three office laptops', 'PC Express', 'FA-A-1102', date '2027-01-06', 135000, 36, 'Three laptops, 45,000 each, for the office staff. They will be used for about three years.') returning id into t;
  insert into ais_fa_task_keys values (t, 'CAPITALIZE', 'Each laptop (45,000) is above the 15,000 policy limit and lasts several years: capitalize.');
  insert into ais_fa_tasks (tenant_id, seq, kind, title, vendor, inv_no, doc_date, net, note) values (p_tenant, 3, 'INVOICE', 'Stapler, folders and two office chairs', 'National Book Store', 'FA-A-1103', date '2027-01-11', 3200, 'Small office items.') returning id into t;
  insert into ais_fa_task_keys values (t, 'EXPENSE', 'The whole purchase is only 3,200, well under the 15,000 policy limit: expense it.');
  insert into ais_fa_tasks (tenant_id, seq, kind, title, vendor, inv_no, doc_date, net, note) values (p_tenant, 4, 'INVOICE', 'Forklift annual service and repairs', 'Hi-Lift Services', 'FA-A-1104', date '2027-01-13', 85000, 'Oil, filters, new tyres and a hydraulic hose on the old forklift. The forklift does not last any longer or work any better afterwards.') returning id into t;
  insert into ais_fa_task_keys values (t, 'EXPENSE', 'Routine repairs and servicing keep an asset running; they do not add an asset or extend its life. Even at 85,000 they are an expense. Capitalizing them overstates assets and profit.');
  insert into ais_fa_tasks (tenant_id, seq, kind, title, vendor, inv_no, doc_date, net, life_months, note) values (p_tenant, 5, 'INVOICE', 'Warehouse extension', 'Luzon Builders', 'FA-A-1105', date '2027-01-18', 600000, 240, 'A new storage room built onto the warehouse. It adds floor space and will stand for about twenty years.') returning id into t;
  insert into ais_fa_task_keys values (t, 'CAPITALIZE', 'It adds a lasting asset (more floor space for twenty years): capitalize. Expensing it would understate assets and profit this month.');
  insert into ais_fa_tasks (tenant_id, seq, kind, title, doc_date, note) values (p_tenant, 6, 'DEPRECIATION', 'January 2027 depreciation', date '2027-01-29', 'Run straight-line depreciation for every asset in service by the 15th, once all five invoices are decided.') returning id into t;
  insert into ais_fa_task_keys values (t, null, 'Run it after the invoices are decided, so the new assets are depreciated too.');
  insert into ais_fa_tasks (tenant_id, seq, kind, title, doc_date, asset_id, proceeds, note) values (p_tenant, 7, 'DISPOSAL', 'Sale of the old forklift', date '2027-01-29', fk, 18000, 'The 2022 forklift is sold for 18,000 cash. Bring depreciation up to date first.') returning id into t;
  insert into ais_fa_task_keys values (t, null, 'Fully depreciated, so the whole 18,000 is a gain on disposal.');
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_fa_state()
returns jsonb as $$
declare
  c record; t uuid; res jsonb;
begin
  select * into c from ais__wb_context(false);
  t := c.tenant;
  perform ais__fa_seed(t);
  select jsonb_build_object(
    'phase', (select phase from ais_instances where id = c.inst),
    'assets', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'name', a.name, 'cost', a.cost, 'life_months', a.life_months, 'in_service', a.in_service, 'acc_dep', a.acc_dep, 'nbv', a.cost - a.acc_dep, 'status', a.status) order by a.code), '[]'::jsonb) from ais_fa_assets a where a.tenant_id = t),
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'seq', x.seq, 'kind', x.kind, 'title', x.title, 'vendor', x.vendor, 'inv_no', x.inv_no, 'doc_date', x.doc_date, 'net', x.net, 'life_months', x.life_months, 'proceeds', x.proceeds, 'note', x.note, 'state', x.state, 'decision', x.decision) order by x.seq), '[]'::jsonb) from ais_fa_tasks x where x.tenant_id = t)
  ) into res;
  return res;
end;
$$ language plpgsql volatile security definer set search_path = public;

-- ---------- invoices: the student's capital-or-expense decision ----------
create or replace function ais_fa_decide(p_task uuid, p_decision text)
returns uuid as $$
declare
  c record; x ais_fa_tasks%rowtype; k ais_fa_task_keys%rowtype; vt numeric; e uuid; inst uuid; aid uuid; lines jsonb;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_fa_tasks where id = p_task and tenant_id = c.tenant;
  if not found then raise exception 'That card does not belong to your company.'; end if;
  if x.kind <> 'INVOICE' then raise exception 'This card is not a vendor invoice.'; end if;
  if x.state <> 'NEW' then raise exception 'This invoice has already been recorded.'; end if;
  if p_decision not in ('CAPITALIZE', 'EXPENSE') then raise exception 'Choose capitalize or expense.'; end if;
  vt := round(x.net * 0.12, 2);
  lines := jsonb_build_array(jsonb_build_object('acct', case when p_decision = 'CAPITALIZE' then '1500' else '5100' end, 'debit', x.net, 'credit', 0),
    jsonb_build_object('acct', '1160', 'debit', vt, 'credit', 0), jsonb_build_object('acct', '2000', 'debit', 0, 'credit', x.net + vt));
  e := ais__post_entry_src(c.tenant, ais__wb_next_weekday(x.doc_date), case when p_decision = 'CAPITALIZE' then 'Fixed asset purchase ' else 'Expense purchase ' end || x.inv_no || ' — ' || x.vendor, 'ais_fa_tasks', x.id, lines);
  if p_decision = 'CAPITALIZE' then
    insert into ais_fa_assets (tenant_id, code, name, cost, life_months, in_service) values (c.tenant, 'FA-' || lpad((select count(*) + 1 from ais_fa_assets where tenant_id = c.tenant)::text, 3, '0'), x.title, x.net, coalesce(x.life_months, 60), x.doc_date) returning id into aid;
  end if;
  update ais_fa_tasks set state = 'DONE', decision = p_decision, entry_id = e where id = x.id;
  select * into k from ais_fa_task_keys where task_id = x.id;
  select id into inst from ais_instances where tenant_id = c.tenant;
  if p_decision is distinct from k.correct and inst is not null then
    insert into ais_planted (instance_id, tenant_id, entry_id, type, detail) values (inst, c.tenant, e, 'CAPEX_ERROR',
      jsonb_build_object('source', 'assets', 'invoice', x.inv_no, 'amount', x.net, 'chosen', p_decision, 'correct', k.correct));
  end if;
  return e;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the January depreciation run ----------
create or replace function ais_fa_depreciate()
returns numeric as $$
declare
  c record; run ais_fa_tasks%rowtype; a record; m numeric; tot numeric := 0; undecided int; e uuid;
begin
  select * into c from ais__wb_context(true);
  select * into run from ais_fa_tasks where tenant_id = c.tenant and kind = 'DEPRECIATION';
  if run.state <> 'NEW' then raise exception 'January depreciation has already been run.'; end if;
  select count(*) into undecided from ais_fa_tasks where tenant_id = c.tenant and kind = 'INVOICE' and state = 'NEW';
  if undecided > 0 then raise exception '% invoice(s) are not decided yet. Decide capital or expense for each one first, so every new asset is depreciated.', undecided; end if;
  for a in select * from ais_fa_assets where tenant_id = c.tenant and status = 'ACTIVE' and in_service <= date '2027-01-15' loop
    m := least(round((a.cost - a.salvage) / a.life_months, 2), a.cost - a.salvage - a.acc_dep);
    if m > 0 then update ais_fa_assets set acc_dep = acc_dep + m where id = a.id; tot := tot + m; end if;
  end loop;
  if tot > 0 then
    e := ais__post_entry_src(c.tenant, date '2027-01-29', 'Depreciation January 2027', 'ais_fa_tasks', run.id,
      jsonb_build_array(jsonb_build_object('acct', '5400', 'debit', tot, 'credit', 0), jsonb_build_object('acct', '1590', 'debit', 0, 'credit', tot)));
  end if;
  update ais_fa_tasks set state = 'DONE', entry_id = e where id = run.id;
  return tot;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- the disposal ----------
create or replace function ais_fa_dispose(p_task uuid)
returns numeric as $$
declare
  c record; x ais_fa_tasks%rowtype; dep ais_fa_tasks%rowtype; a ais_fa_assets%rowtype; gain numeric; e uuid; lines jsonb;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_fa_tasks where id = p_task and tenant_id = c.tenant;
  if not found then raise exception 'That card does not belong to your company.'; end if;
  if x.kind <> 'DISPOSAL' then raise exception 'This card is not a disposal.'; end if;
  if x.state <> 'NEW' then raise exception 'This disposal has already been recorded.'; end if;
  select * into dep from ais_fa_tasks where tenant_id = c.tenant and kind = 'DEPRECIATION';
  if dep.state <> 'DONE' then raise exception 'Run January depreciation first, so the asset is up to date at the date of sale.'; end if;
  select * into a from ais_fa_assets where id = x.asset_id;
  gain := x.proceeds - (a.cost - a.acc_dep);
  lines := jsonb_build_array(jsonb_build_object('acct', '1000', 'debit', x.proceeds, 'credit', 0), jsonb_build_object('acct', '1590', 'debit', a.acc_dep, 'credit', 0),
    jsonb_build_object('acct', '1500', 'debit', 0, 'credit', a.cost));
  if gain > 0 then lines := lines || jsonb_build_object('acct', '4100', 'debit', 0, 'credit', gain);
  elsif gain < 0 then lines := lines || jsonb_build_object('acct', '5100', 'debit', -gain, 'credit', 0); end if;
  e := ais__post_entry_src(c.tenant, ais__wb_next_weekday(x.doc_date), 'Sale of ' || a.name || ' (' || a.code || ')', 'ais_fa_tasks', x.id, lines);
  update ais_fa_assets set status = 'DISPOSED' where id = a.id;
  update ais_fa_tasks set state = 'DONE', entry_id = e where id = x.id;
  return gain;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_fa_my_score()
returns jsonb as $$
declare
  c record; pts numeric := 0; mx numeric := 0; rws jsonb := '[]'::jsonb; x record; p numeric; msg text;
begin
  select * into c from ais__wb_context(false);
  if not ais__results_visible(c.inst) then return jsonb_build_object('visible', false); end if;
  for x in select t.*, k.correct, k.why from ais_fa_tasks t join ais_fa_task_keys k on k.task_id = t.id where t.tenant_id = c.tenant order by t.seq loop
    mx := mx + 6; p := 0;
    if x.kind = 'INVOICE' then
      if x.state = 'NEW' then p := 0; msg := 'Not decided.';
      elsif x.decision = x.correct then p := 6; msg := case when x.correct = 'CAPITALIZE' then 'Correct: capitalized.' else 'Correct: expensed.' end;
      else p := 0; msg := case when x.correct = 'CAPITALIZE' then 'This should have been capitalized.' else 'This should have been expensed.' end; end if;
    else
      p := case when x.state = 'DONE' then 6 else 0 end; msg := case when p = 6 then 'Recorded.' else 'Not done.' end;
    end if;
    pts := pts + p;
    rws := rws || jsonb_build_object('seq', x.seq, 'ref_no', x.title, 'points', p, 'max', 6, 'message', msg, 'why', x.why);
  end loop;
  return jsonb_build_object('visible', true, 'points', pts, 'max', mx, 'rows', rws);
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function ais__fa_seed(uuid) from public, anon, authenticated;
revoke execute on function ais_fa_state(), ais_fa_decide(uuid, text), ais_fa_depreciate(), ais_fa_dispose(uuid), ais_fa_my_score() from public, anon;
grant execute on function ais_fa_state(), ais_fa_decide(uuid, text), ais_fa_depreciate(), ais_fa_dispose(uuid), ais_fa_my_score() to authenticated;
