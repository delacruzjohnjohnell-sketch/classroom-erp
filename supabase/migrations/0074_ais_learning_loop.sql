-- ============================================================
-- Classroom ERP — migration 0074 (AIS edition, step 6: close the learning loop; findings F1, F4, F5, F6 and the housekeeping of the audit, AIS_AUDIT.md)
--
-- Needs 0069–0073. Replaces two of our own functions (ais_decide, ais_set_seats), adds three, one settings column, indexes, and one small data change to our own set.
--
--   ais_doc_review(txn)      F1  After a document is decided, the student sees why it was right or wrong: the right decision, the control that failed, the right journal
--                                with account names, the explanation, the points. Shown at once in a practice round and after the Accounting phase closes in a graded
--                                round (never before: it would give the answers away). Works again every time the document is revisited.
--   ais_decide (replaced)    A practice-round student who has been refused twice is told which accounts the right journal uses (not the amounts).
--   ais_restart_company      F4  The teacher starts a new round for a company: a new company with the same name + "round N", the same members and seats, the same
--                                settings, and a practice set assigned. The old company stays as the record of the earlier round.
--   ais_set_seats (replaced) F5  By default one student cannot hold both seats: the Accounting and Audit seats go to two different students so the audit is independent.
--                                ais_set_solo lets the teacher allow one student to do both (solo practice). Companies that exist today are set to allow it.
--   F6                           The first set's cash receipts were multiples of 5,000, so the round-amount test flagged an honest entry. The amounts are now arbitrary pesos.
--   Housekeeping                 Indexes on the AIS foreign keys; the two read policies cache auth.uid().
--
-- ROLLBACK:
--   drop function if exists ais_restart_company(uuid, text, bigint, text, date), ais_set_solo(uuid, boolean), ais_doc_review(uuid);
--   alter table ais_company_settings drop column if exists allow_solo;
--   (re-run ais_decide from 0069 and ais_set_seats from 0066; the indexes are harmless)
-- ============================================================

-- ---------- housekeeping ----------
create index if not exists ais_decisions_tenant on ais_decisions (tenant_id);
create index if not exists ais_results_tenant on ais_results (tenant_id);
create index if not exists ais_findings_type on ais_findings (exception_type);
create index if not exists ais_findings_workpaper on ais_findings (workpaper_id) where workpaper_id is not null;
create index if not exists ais_workpapers_sample on ais_workpapers (sample_id) where sample_id is not null;
create index if not exists ais_sample_items_tenant on ais_sample_items (tenant_id);
create index if not exists ais_samples_tenant on ais_samples (tenant_id);
create index if not exists ais_test_runs_tenant on ais_test_runs (tenant_id);
create index if not exists ais_planted_instance on ais_planted (instance_id);
create index if not exists ais_instances_set on ais_instances (set_id);
drop policy if exists "ais controls read" on ais_controls;
create policy "ais controls read" on ais_controls for select using ((select auth.uid()) is not null);
drop policy if exists "ais finding types read" on ais_finding_types;
create policy "ais finding types read" on ais_finding_types for select using ((select auth.uid()) is not null);

-- ---------- F6: cash receipts that are not round ----------
update ais_set_txns
   set template = jsonb_set(template, '{vars}', (select jsonb_agg(case when v ->> 'name' = 'amt' then jsonb_set(v, '{range}', '[60001, 159999, 1]'::jsonb) else v end order by o)
                                                  from jsonb_array_elements(template -> 'vars') with ordinality as t(v, o)))
 where set_id = 'sinag-revenue-jan-2027' and seq = 8
   and not exists (select 1 from ais_instances i where i.set_id = 'sinag-revenue-jan-2027');

-- ---------- F5: pairing ----------
alter table ais_company_settings add column if not exists allow_solo boolean not null default false;
update ais_company_settings set allow_solo = true where created_at < now();       -- companies that exist today keep working as they are

create or replace function ais_set_seats(p_tenant uuid, p_user uuid, p_seats text[])
returns void as $$
declare
  k text; solo boolean;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can add members or change seats.'; end if;
  perform assert_ais_tenant(p_tenant);
  if not exists (select 1 from profiles where id = p_user and role = 'student') then raise exception 'Choose a student.'; end if;
  foreach k in array coalesce(p_seats, array[]::text[]) loop
    if k not in ('ACCOUNTING', 'AUDIT') then raise exception 'Unknown seat: %', k; end if;
  end loop;
  select coalesce(s.allow_solo, false) into solo from ais_company_settings s where s.tenant_id = p_tenant;
  if 'ACCOUNTING' = any (coalesce(p_seats, array[]::text[])) and 'AUDIT' = any (coalesce(p_seats, array[]::text[])) and not coalesce(solo, false) then
    raise exception 'In this company two different students hold the Accounting and the Audit seats, so the audit is independent. Turn on solo practice for the company if one student should do both.';
  end if;
  insert into memberships (user_id, tenant_id) values (p_user, p_tenant) on conflict do nothing;
  update profiles set tenant_id = p_tenant where id = p_user and tenant_id is null;
  insert into edition_last_used (user_id, edition, tenant_id) values (p_user, 'AIS', p_tenant) on conflict (user_id, edition) do nothing;
  delete from ais_company_roles where tenant_id = p_tenant and user_id = p_user;
  insert into ais_company_roles (tenant_id, user_id, seat, assigned_by)
  select p_tenant, p_user, s.x, auth.uid() from (select distinct unnest(coalesce(p_seats, array[]::text[])) as x) s;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_set_solo(p_tenant uuid, p_allow boolean)
returns void as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can change solo practice.'; end if;
  perform assert_ais_tenant(p_tenant);
  update ais_company_settings set allow_solo = coalesce(p_allow, false) where tenant_id = p_tenant;
  if not found then raise exception 'That company has no AIS settings.'; end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- F1: why a document was right or wrong ----------
create or replace function ais_doc_review(p_txn uuid)
returns jsonb as $$
declare
  t uuid := ais__my_tenant('ACCOUNTING'); x ais_instance_txns%rowtype; inst ais_instances%rowtype; k jsonb; d ais_decisions%rowtype; r ais_results%rowtype;
begin
  select * into x from ais_instance_txns where id = p_txn and tenant_id = t;
  if not found then raise exception 'That document is not in your company.'; end if;
  if x.status = 'PENDING' then raise exception 'Decide the document first.'; end if;
  select * into inst from ais_instances where id = x.instance_id;
  if not ais__results_visible(inst.id) then
    return jsonb_build_object('visible', false, 'message', 'The explanation appears when the Accounting phase is closed.');
  end if;
  select ik.key into k from ais_instance_keys ik where ik.txn_id = x.id;
  select * into d from ais_decisions where txn_id = x.id;
  select * into r from ais_results where txn_id = x.id;
  return jsonb_build_object('visible', true,
    'key_decision', k ->> 'decision', 'failed_control', k ->> 'failed_control',
    'failed_label', (select c.label from ais_controls c where c.tag = k ->> 'failed_control'),
    'explanation', k -> 'explanation',
    'key_journal', coalesce((select jsonb_agg(jsonb_build_object('acct', j.acct, 'name', a.name, 'debit', j.debit, 'credit', j.credit) order by j.debit desc, j.acct)
                               from jsonb_to_recordset(k -> 'journal') as j(acct text, debit numeric, credit numeric) left join accounts a on a.tenant_id = t and a.code = j.acct), '[]'::jsonb),
    'your_decision', d.decision, 'your_control', d.failed_control,
    'your_control_label', (select c.label from ais_controls c where c.tag = d.failed_control),
    'points', r.points, 'max', 6, 'detail', r.detail, 'correct_decision', r.correct_decision);
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------- practice-round hint after two refused tries (replaces ais_decide from 0069; only the refusal message changes) ----------
create or replace function ais_decide(p_txn uuid, p_decision text, p_failed_control text, p_lines jsonb)
returns jsonb as $$
declare
  t uuid := ais__my_tenant('ACCOUNTING');
  inst ais_instances%rowtype; x ais_instance_txns%rowtype; k jsonb; lines jsonb; locked date;
  key_dec text; ok_j boolean := null; ok_c boolean := null; pts numeric := 0; entry uuid; vis boolean; detail text; hint text;
begin
  select * into inst from ais_instances where tenant_id = t;
  if not found then raise exception 'No practice set has been assigned to this company yet.'; end if;
  if inst.phase <> 'ACCOUNTING' then raise exception 'The Accounting phase is closed.'; end if;
  select * into x from ais_instance_txns where id = p_txn and tenant_id = t for update;
  if not found then raise exception 'That document is not in your company.'; end if;
  if x.status <> 'PENDING' then raise exception 'You already decided this document. A decision is final.'; end if;
  if p_decision not in ('POST', 'HOLD') then raise exception 'Decide to POST or to HOLD.'; end if;
  select ik.key into k from ais_instance_keys ik where ik.txn_id = x.id;
  key_dec := k ->> 'decision';

  if p_decision = 'HOLD' then
    if not exists (select 1 from ais_controls c where c.tag = p_failed_control) then raise exception 'Name the control that failed.'; end if;
    ok_c := (p_failed_control = k ->> 'failed_control');
    if key_dec = 'HOLD' then pts := case when ok_c then 6 else 3 end; detail := case when ok_c then 'Held for the right reason.' else 'Held, but a different control failed.' end;
    else pts := 0; detail := 'A valid document was held.'; end if;
    update ais_instance_txns set status = 'HELD', decided_by = auth.uid(), decided_at = now() where id = x.id;
    insert into ais_decisions (txn_id, tenant_id, user_id, decision, failed_control) values (x.id, t, auth.uid(), 'HOLD', p_failed_control);
    insert into ais_results (txn_id, tenant_id, user_id, points, correct_decision, correct_control, detail) values (x.id, t, auth.uid(), pts, key_dec = 'HOLD', ok_c, detail);
  else
    select books_locked_through into locked from tenants where id = t;
    if locked is not null and x.doc_date <= locked then raise exception 'That document is dated in a closed period.'; end if;
    lines := ais__validate_lines(t, p_lines);
    if key_dec = 'POST' then ok_j := ais__journal_matches(lines, k -> 'journal'); end if;
    if key_dec = 'POST' and inst.mode = 'IMMEDIATE' and not ok_j then
      update ais_instance_txns set wrong_attempts = wrong_attempts + 1 where id = x.id;
      if x.wrong_attempts + 1 >= 2 then
        select 'The right journal debits ' || coalesce(string_agg(distinct j.acct, ', ') filter (where j.debit > 0), 'nothing')
               || ' and credits ' || coalesce(string_agg(distinct j.acct, ', ') filter (where j.credit > 0), 'nothing') || '. Work out the amounts from the documents.'
          into hint from jsonb_to_recordset(k -> 'journal') as j(acct text, debit numeric, credit numeric);
      end if;
      return jsonb_build_object('status', 'PENDING', 'result', 'journal_mismatch', 'wrong_attempts', x.wrong_attempts + 1,
        'message', 'That journal does not match what this document supports. Nothing was posted. Check the accounts and amounts and try again.', 'hint', hint);
    end if;
    if key_dec = 'POST' then
      pts := case when ok_j then greatest(1, 6 - x.wrong_attempts) else 3 end;
      detail := case when ok_j then 'Posted with the right journal.' else 'Right decision, wrong journal.' end;
    else pts := 0; detail := 'An exception was posted; it stays in the books for the Audit seat.'; end if;
    entry := ais__post_entry(t, x.doc_date, x.title, x.id, lines);
    update ais_instance_txns set status = 'POSTED', journal_entry_id = entry, decided_by = auth.uid(), decided_at = now() where id = x.id;
    insert into ais_decisions (txn_id, tenant_id, user_id, decision, lines) values (x.id, t, auth.uid(), 'POST', lines);
    insert into ais_results (txn_id, tenant_id, user_id, points, correct_decision, journal_ok, detail) values (x.id, t, auth.uid(), pts, key_dec = 'POST', ok_j, detail);
  end if;

  vis := inst.mode = 'IMMEDIATE';
  return jsonb_build_object('status', case when p_decision = 'POST' then 'POSTED' else 'HELD' end, 'entry_id', entry,
    'points', case when vis then pts end, 'max_points', case when vis then 6 end, 'detail', case when vis then detail end,
    'explanation', case when vis then k -> 'explanation' end);
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- F4: a new round ----------
create or replace function ais_restart_company(p_tenant uuid, p_set text, p_seed bigint, p_mode text, p_lock date)
returns uuid as $$
declare
  old_t tenants%rowtype; inst ais_instances%rowtype; st ais_company_settings%rowtype; base text; round_n int; nid uuid; m record;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can start a new round.'; end if;
  perform assert_ais_tenant(p_tenant);
  select * into old_t from tenants where id = p_tenant;
  select * into inst from ais_instances where tenant_id = p_tenant;
  select * into st from ais_company_settings where tenant_id = p_tenant;
  base := regexp_replace(old_t.name, ' — round [0-9]+$', '');
  select count(*) + 1 into round_n from tenants t join tenant_editions te on te.tenant_id = t.id
   where te.edition = 'AIS' and (t.name = base or t.name like base || ' — round %');
  nid := ais_create_company(base || ' — round ' || round_n, st.fiscal_year_start);
  update ais_company_settings set allow_solo = st.allow_solo, sod_mode = st.sod_mode where tenant_id = nid;
  for m in select mb.user_id from memberships mb where mb.tenant_id = p_tenant loop
    perform ais_set_seats(nid, m.user_id, coalesce((select array_agg(r.seat order by r.seat) from ais_company_roles r where r.tenant_id = p_tenant and r.user_id = m.user_id), array[]::text[]));
    update profiles set tenant_id = nid where id = m.user_id and tenant_id = p_tenant;
    insert into edition_last_used (user_id, edition, tenant_id) values (m.user_id, 'AIS', nid)
      on conflict (user_id, edition) do update set tenant_id = excluded.tenant_id, opened_at = now();
  end loop;
  perform ais_assign_set(nid, coalesce(p_set, inst.set_id), p_seed, coalesce(p_mode, inst.mode, 'IMMEDIATE'), coalesce(p_lock, inst.lock_date));
  return nid;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function ais_doc_review(uuid), ais_set_solo(uuid, boolean), ais_restart_company(uuid, text, bigint, text, date), ais_set_seats(uuid, uuid, text[]), ais_decide(uuid, text, text, jsonb) from public, anon;
grant execute on function ais_doc_review(uuid), ais_set_solo(uuid, boolean), ais_restart_company(uuid, text, bigint, text, date), ais_set_seats(uuid, uuid, text[]), ais_decide(uuid, text, text, jsonb) to authenticated;
