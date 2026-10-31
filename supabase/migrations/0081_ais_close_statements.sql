-- ============================================================
-- Classroom ERP — migration 0081 (AIS edition: closing the books and the financial statements)
--
-- Needs 0076-0080. Adds two tables and functions; nothing existing is altered.
--
-- The last step of the cycle, from the ledger the other desks wrote:
--   1 ALLOWANCE FOR DOUBTFUL ACCOUNTS. The student works out 2% of the receivable balance (shown on the screen) and enters it: Dr Bad Debts Expense, Cr Allowance.
--     A wrong figure is refused with a hint to recompute; the right one is posted.
--   2 ACCRUED UTILITIES. The January electricity bill (18,000) arrives in February. The student decides ACCRUE (Dr Operating Expenses, Cr Accrued Expenses) or SKIP
--     ("record it when it is paid"). Skipping leaves a liability off the books: it is planted for the Audit seat as a cutoff error.
--   3 CLOSING ENTRIES. After 1 and 2, the system closes revenue and expense accounts to the owner's equity account (3000).
-- ais_cl_statements() returns, for the period through the lock date: a trial balance, an income statement and a balance sheet, with the checks that debits equal
-- credits and that assets equal liabilities plus equity. The statements are always available, before and after the adjustments, so the student sees their effect.
-- The adjusting and closing entries are dated Friday 29 January so the Audit seat's weekend test does not flag them.
-- ROLLBACK: drop table if exists ais_cl_task_keys, ais_cl_tasks; drop the ais_cl_* functions.
-- ============================================================

create table if not exists ais_cl_tasks (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade,
  seq int not null, kind text not null check (kind in ('ALLOWANCE', 'ACCRUAL', 'CLOSING')), title text not null, note text, amount numeric(14,2),
  state text not null default 'NEW' check (state in ('NEW', 'DONE')), decision text check (decision in ('ACCRUE', 'SKIP')), entry_id uuid, unique (tenant_id, seq)
);
create table if not exists ais_cl_task_keys (task_id uuid primary key references ais_cl_tasks(id) on delete cascade, correct text, why text not null);
alter table ais_cl_tasks enable row level security; alter table ais_cl_task_keys enable row level security;

create or replace function ais__cl_seed(p_tenant uuid)
returns void as $$
declare
  t uuid;
begin
  if exists (select 1 from ais_cl_tasks where tenant_id = p_tenant) then return; end if;
  insert into ais_cl_tasks (tenant_id, seq, kind, title, note) values (p_tenant, 1, 'ALLOWANCE', 'Allowance for doubtful accounts',
    'Company policy: estimate that 2% of the receivable balance at month end will not be collected. Work out the figure from the receivable balance on this page.') returning id into t;
  insert into ais_cl_task_keys values (t, null, 'The estimate is 2% of the accounts receivable balance (rounded to the centavo). It is recorded as Bad Debts Expense against the Allowance for Doubtful Accounts, so receivables are not overstated.');
  insert into ais_cl_tasks (tenant_id, seq, kind, title, note, amount) values (p_tenant, 2, 'ACCRUAL', 'January electricity bill received in February',
    'The electric company''s bill for January usage, 18,000.00, arrives on 3 February. Nothing has been recorded. Accrue it in January, or skip it and record it when it is paid?', 18000) returning id into t;
  insert into ais_cl_task_keys values (t, 'ACCRUE', 'The electricity was used in January, so the expense and the liability belong in January even though the bill arrives in February (accrual accounting). Skipping understates expenses and liabilities, a cutoff error.');
  insert into ais_cl_tasks (tenant_id, seq, kind, title, note) values (p_tenant, 3, 'CLOSING', 'Closing entries',
    'Close revenue and expense accounts to owner''s equity once the adjusting entries are in.') returning id into t;
  insert into ais_cl_task_keys values (t, null, 'After the adjustments, revenue and expenses are closed to the owner''s equity account so the new period starts at zero.');
end;
$$ language plpgsql security definer set search_path = public;

-- the statements for the period through the lock date, from the posted ledger
create or replace function ais__cl_statements(p_tenant uuid, p_through date)
returns jsonb as $$
declare
  rows_ jsonb; ni numeric; rev numeric; exp_ numeric; assets numeric; liab numeric; eq numeric; closed boolean; td numeric; tc numeric;
begin
  closed := exists (select 1 from journal_entries where tenant_id = p_tenant and source_table = 'ais_cl_tasks' and memo like 'Closing entry%');
  create temporary table if not exists ais_tmp_fs (code text, name text, type text, d numeric, c numeric, op_d numeric, op_c numeric) on commit drop;
  delete from ais_tmp_fs where true;
  insert into ais_tmp_fs
    select a.code, a.name, a.type, coalesce(sum(l.debit), 0), coalesce(sum(l.credit), 0),
           coalesce(sum(l.debit) filter (where j.memo not like 'Closing entry%'), 0), coalesce(sum(l.credit) filter (where j.memo not like 'Closing entry%'), 0)
      from accounts a left join journal_lines l on l.account_id = a.id
      left join journal_entries j on j.id = l.journal_entry_id and j.tenant_id = p_tenant and j.entry_date <= p_through
     where a.tenant_id = p_tenant and (j.id is not null or l.id is null) group by a.code, a.name, a.type;
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'type', type, 'debit', greatest(d - c, 0), 'credit', greatest(c - d, 0)) order by code) filter (where d <> 0 or c <> 0), '[]'::jsonb),
         coalesce(sum(greatest(d - c, 0)), 0), coalesce(sum(greatest(c - d, 0)), 0) into rows_, td, tc from ais_tmp_fs;
  select coalesce(sum(op_c - op_d) filter (where type = 'revenue'), 0), coalesce(sum(op_d - op_c) filter (where type = 'expense'), 0) into rev, exp_ from ais_tmp_fs;
  ni := rev - exp_;
  select coalesce(sum(d - c) filter (where type = 'asset'), 0), coalesce(sum(c - d) filter (where type = 'liability'), 0), coalesce(sum(c - d) filter (where type = 'equity'), 0) into assets, liab, eq from ais_tmp_fs;
  return jsonb_build_object('through', p_through, 'closed', closed, 'trial_balance', rows_, 'td', td, 'tc', tc, 'tb_ok', td = tc,
    'income', jsonb_build_object('revenue', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', op_c - op_d) order by code) filter (where type = 'revenue' and (op_c <> 0 or op_d <> 0)), '[]'::jsonb) from ais_tmp_fs),
                                 'expenses', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', op_d - op_c) order by code) filter (where type = 'expense' and (op_c <> 0 or op_d <> 0)), '[]'::jsonb) from ais_tmp_fs),
                                 'total_revenue', rev, 'total_expenses', exp_, 'net_income', ni),
    'balance', jsonb_build_object('assets', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', d - c) order by code) filter (where type = 'asset' and (d <> 0 or c <> 0)), '[]'::jsonb) from ais_tmp_fs),
                                  'liabilities', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', c - d) order by code) filter (where type = 'liability' and (d <> 0 or c <> 0)), '[]'::jsonb) from ais_tmp_fs),
                                  'equity_accounts', (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'name', name, 'amount', c - d) order by code) filter (where type = 'equity' and (d <> 0 or c <> 0)), '[]'::jsonb) from ais_tmp_fs),
                                  'current_earnings', case when closed then 0 else ni end,
                                  'total_assets', assets, 'total_liabilities', liab, 'total_equity', eq + case when closed then 0 else ni end,
                                  'balanced', assets = liab + eq + case when closed then 0 else ni end));
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_cl_state()
returns jsonb as $$
declare
  c record; t uuid; ar numeric; thr date;
begin
  select * into c from ais__wb_context(false);
  t := c.tenant; thr := coalesce(c.lock_date, date '2027-01-31');
  perform ais__cl_seed(t);
  select coalesce(sum(l.debit - l.credit), 0) into ar from journal_lines l join accounts a on a.id = l.account_id join journal_entries j on j.id = l.journal_entry_id where j.tenant_id = t and a.code = '1100' and j.entry_date <= thr;
  return jsonb_build_object('phase', (select phase from ais_instances where id = c.inst), 'receivable', ar,
    'tasks', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'seq', x.seq, 'kind', x.kind, 'title', x.title, 'note', x.note, 'amount', x.amount, 'state', x.state, 'decision', x.decision) order by x.seq), '[]'::jsonb) from ais_cl_tasks x where x.tenant_id = t),
    'statements', ais__cl_statements(t, thr));
end;
$$ language plpgsql volatile security definer set search_path = public;

create or replace function ais_cl_allowance(p_amount numeric)
returns uuid as $$
declare
  c record; x ais_cl_tasks%rowtype; ar numeric; e uuid;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_cl_tasks where tenant_id = c.tenant and kind = 'ALLOWANCE';
  if x.state <> 'NEW' then raise exception 'The allowance has already been recorded.'; end if;
  select coalesce(sum(l.debit - l.credit), 0) into ar from journal_lines l join accounts a on a.id = l.account_id join journal_entries j on j.id = l.journal_entry_id
   where j.tenant_id = c.tenant and a.code = '1100' and j.entry_date <= coalesce(c.lock_date, date '2027-01-31');
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount of the allowance.'; end if;
  if p_amount <> round(ar * 0.02, 2) then raise exception 'That is not 2%% of the receivable balance. Recompute 2%% of the balance shown on the page, to the centavo.'; end if;
  e := ais__post_entry_src(c.tenant, date '2027-01-29', 'Adjusting entry — allowance for doubtful accounts, January 2027', 'ais_cl_tasks', x.id,
    jsonb_build_array(jsonb_build_object('acct', '5110', 'debit', p_amount, 'credit', 0), jsonb_build_object('acct', '1110', 'debit', 0, 'credit', p_amount)));
  update ais_cl_tasks set state = 'DONE', amount = p_amount, entry_id = e where id = x.id;
  return e;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_cl_accrue(p_decision text)
returns uuid as $$
declare
  c record; x ais_cl_tasks%rowtype; e uuid; inst uuid;
begin
  select * into c from ais__wb_context(true);
  select * into x from ais_cl_tasks where tenant_id = c.tenant and kind = 'ACCRUAL';
  if x.state <> 'NEW' then raise exception 'The accrual has already been decided.'; end if;
  if p_decision not in ('ACCRUE', 'SKIP') then raise exception 'Choose accrue or skip.'; end if;
  if p_decision = 'ACCRUE' then
    e := ais__post_entry_src(c.tenant, date '2027-01-29', 'Adjusting entry — accrued electricity, January 2027', 'ais_cl_tasks', x.id,
      jsonb_build_array(jsonb_build_object('acct', '5100', 'debit', x.amount, 'credit', 0), jsonb_build_object('acct', '2300', 'debit', 0, 'credit', x.amount)));
  else
    select id into inst from ais_instances where tenant_id = c.tenant;
    if inst is not null then
      insert into ais_planted (instance_id, tenant_id, entry_id, type, detail) values (inst, c.tenant, null, 'CUTOFF',
        jsonb_build_object('source', 'close', 'item', 'January electricity not accrued', 'amount', x.amount));
    end if;
  end if;
  update ais_cl_tasks set state = 'DONE', decision = p_decision, entry_id = e where id = x.id;
  return e;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_cl_close()
returns numeric as $$
declare
  c record; x ais_cl_tasks%rowtype; open_ int; ni numeric; lines jsonb := '[]'::jsonb; a record; e uuid; thr date;
begin
  select * into c from ais__wb_context(true);
  thr := coalesce(c.lock_date, date '2027-01-31');
  select * into x from ais_cl_tasks where tenant_id = c.tenant and kind = 'CLOSING';
  if x.state <> 'NEW' then raise exception 'The books have already been closed for January.'; end if;
  select count(*) into open_ from ais_cl_tasks where tenant_id = c.tenant and kind <> 'CLOSING' and state = 'NEW';
  if open_ > 0 then raise exception 'Record both adjusting entries (allowance and accrual) before closing.'; end if;
  for a in select ac.code, sum(l.debit - l.credit) as bal from accounts ac join journal_lines l on l.account_id = ac.id join journal_entries j on j.id = l.journal_entry_id
            where ac.tenant_id = c.tenant and ac.type in ('revenue', 'expense') and j.entry_date <= thr group by ac.code having sum(l.debit - l.credit) <> 0 order by ac.code loop
    lines := lines || jsonb_build_object('acct', a.code, 'debit', case when a.bal < 0 then -a.bal else 0 end, 'credit', case when a.bal > 0 then a.bal else 0 end);
    ni := coalesce(ni, 0) - a.bal;
  end loop;
  if ni is null then raise exception 'There is nothing to close.'; end if;
  lines := lines || jsonb_build_object('acct', '3000', 'debit', case when ni < 0 then -ni else 0 end, 'credit', case when ni > 0 then ni else 0 end);
  e := ais__post_entry_src(c.tenant, date '2027-01-29', 'Closing entry January 2027 — revenue and expenses to owner''s equity', 'ais_cl_tasks', x.id, lines);
  update ais_cl_tasks set state = 'DONE', entry_id = e, amount = ni where id = x.id;
  return ni;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_cl_my_score()
returns jsonb as $$
declare
  c record; pts numeric := 0; mx numeric := 0; rws jsonb := '[]'::jsonb; x record; p numeric; msg text;
begin
  select * into c from ais__wb_context(false);
  if not ais__results_visible(c.inst) then return jsonb_build_object('visible', false); end if;
  for x in select t.*, k.correct, k.why from ais_cl_tasks t join ais_cl_task_keys k on k.task_id = t.id where t.tenant_id = c.tenant order by t.seq loop
    mx := mx + 6; p := 0;
    if x.kind = 'ACCRUAL' then
      if x.state = 'NEW' then msg := 'Not decided.'; elsif x.decision = 'ACCRUE' then p := 6; msg := 'Correct: accrued in January.'; else msg := 'The January electricity should have been accrued.'; end if;
    else
      p := case when x.state = 'DONE' then 6 else 0 end; msg := case when p = 6 then 'Recorded.' else 'Not done.' end;
    end if;
    pts := pts + p;
    rws := rws || jsonb_build_object('seq', x.seq, 'ref_no', x.title, 'points', p, 'max', 6, 'message', msg, 'why', x.why);
  end loop;
  return jsonb_build_object('visible', true, 'points', pts, 'max', mx, 'rows', rws);
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function ais__cl_seed(uuid), ais__cl_statements(uuid, date) from public, anon, authenticated;
revoke execute on function ais_cl_state(), ais_cl_allowance(numeric), ais_cl_accrue(text), ais_cl_close(), ais_cl_my_score() from public, anon;
grant execute on function ais_cl_state(), ais_cl_allowance(numeric), ais_cl_accrue(text), ais_cl_close(), ais_cl_my_score() to authenticated;
