-- ============================================================
-- Classroom ERP — migration 0075 (AIS edition: two defects found by the first real click-through)
--
-- Needs 0072 and 0074. Edits one of our own functions in place and recreates one of our own functions. Nothing else is touched.
--
--   1. ais_test_run began with "delete from ais_tmp_pop;". The live API layer refuses a DELETE with no WHERE ("DELETE requires a WHERE clause"), so every Audit
--      test failed for a student. (Direct SQL runs do not have that guard, which is why the earlier dry runs did not see it.) The statement now reads
--      "delete from ais_tmp_pop where true;". It is rewritten in place so the rest of the function is exactly what 0072 installed.
--   2. After a forced close, documents nobody decided were shown as "Held". ais_inbox now also says whether the student made a decision (was_decided), so the
--      screen can say "Not decided".
--
-- ROLLBACK: re-run ais_test_run from 0072; drop function ais_inbox(); re-create it from 0069.
-- ============================================================

do $do$
declare
  d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'ais_test_run' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'ais_test_run was not found'; end if;
  if position('delete from ais_tmp_pop where true;' in d) > 0 then return; end if;     -- already fixed
  n := replace(d, 'delete from ais_tmp_pop;', 'delete from ais_tmp_pop where true;');
  if n = d then raise exception 'ais_test_run: the delete statement was not found'; end if;
  execute n;
end $do$;

drop function if exists ais_inbox();
create or replace function ais_inbox()
returns table (id uuid, seq int, title text, doc_date date, status text, wrong_attempts int, points numeric, max_points numeric, was_decided boolean) as $$
declare
  t uuid := ais__my_tenant('ACCOUNTING'); inst uuid; vis boolean;
begin
  select i.id into inst from ais_instances i where i.tenant_id = t;
  if inst is null then return; end if;
  vis := ais__results_visible(inst);
  return query
  select x.id, x.seq, x.title, x.doc_date, x.status, x.wrong_attempts,
         case when vis then r.points end, case when vis then r.max_points end,
         exists (select 1 from ais_decisions d where d.txn_id = x.id)
    from ais_instance_txns x left join ais_results r on r.txn_id = x.id
   where x.instance_id = inst order by x.seq;
end;
$$ language plpgsql stable security definer set search_path = public;
revoke execute on function ais_inbox() from public, anon;
grant execute on function ais_inbox() to authenticated;
