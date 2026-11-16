-- ============================================================
-- 0088  AIS: open a practice set to the class; students start it themselves
--
-- Until now only the teacher could make an AIS company and assign a set to it. Now the teacher can OPEN a set (a switch per set), and every student who may use
-- the AIS system then sees it and starts it with one click. Starting makes the student their own company (the same chart of accounts), gives them both seats
-- (solo practice) and assigns the set with a seed of their own, so no two students hold the same numbers.
--
--   ais_sets.open, open_mode, open_lock     the switch, and the mode (IMMEDIATE = practice, AFTER_CLOSE = graded) and the lock date used for companies started from it
--   ais__make_company(name, fiscal_start)   a copy of ais_create_company without the teacher-only check (internal, not callable from the API)
--   ais_set_open(set, open, mode, lock)     teacher only: open or close a set
--   ais_open_state()                        teacher only: which sets are open, with their mode and lock date
--   ais_open_sets()                         the sets open to this student, and the company they already started from each (if any)
--   ais_start_set(set)                      a student starts an open set: returns their company (the same one if they already started it)
--
-- A student can start each open set once. A second round is the teacher's "Start a new round" on the company, as before. Closing a set stops new starts; companies
-- already started keep working. Needs the AIS edition opened by the teacher and the AIS system ticked for the student (migration 0085).
--
-- ROLLBACK: drop function ais_start_set(text), ais_open_sets(), ais_open_state(), ais_set_open(text, boolean, text, date), ais__make_company(text, date);
--           alter table ais_sets drop column open, drop column open_mode, drop column open_lock.
-- ============================================================

alter table ais_sets add column if not exists open boolean not null default false;
alter table ais_sets add column if not exists open_mode text not null default 'IMMEDIATE' check (open_mode in ('IMMEDIATE', 'AFTER_CLOSE'));
alter table ais_sets add column if not exists open_lock date;

do $do$
declare
  d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ais_create_company';
  if d is null then raise exception 'ais_create_company was not found'; end if;
  n := replace(d, 'FUNCTION public.ais_create_company', 'FUNCTION public.ais__make_company');
  n := replace(n, 'if is_teacher() is not true then raise exception ''Only the teacher can create an AIS company.''; end if;', '');
  if n = d or position('Only the teacher can create an AIS company' in n) > 0 then raise exception 'Could not derive ais__make_company (function text changed)'; end if;
  execute n;
end
$do$;
revoke execute on function ais__make_company(text, date) from public, anon, authenticated;

create or replace function ais_set_open(p_set text, p_open boolean, p_mode text default 'IMMEDIATE', p_lock date default null)
returns void as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can open a practice set.'; end if;
  if not exists (select 1 from ais_sets where id = p_set) then raise exception 'That practice set does not exist.'; end if;
  if p_mode not in ('IMMEDIATE', 'AFTER_CLOSE') then raise exception 'Mode must be IMMEDIATE (practice) or AFTER_CLOSE (graded).'; end if;
  if coalesce(p_open, false) and not exists (select 1 from ais_set_txns where set_id = p_set) then raise exception 'That practice set has no transactions.'; end if;
  update ais_sets set open = coalesce(p_open, false), open_mode = p_mode, open_lock = p_lock where id = p_set;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_open_state()
returns jsonb as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see this.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'open', s.open, 'mode', s.open_mode, 'lock', s.open_lock,
                                                       'started', (select count(*) from ais_instances i join tenants t on t.id = i.tenant_id where i.set_id = s.id and t.owner_id is not null and t.owner_id <> auth.uid())))
                     from ais_sets s), '[]'::jsonb);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_open_sets()
returns jsonb as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if is_teacher() or access_blocked() or not has_module('ais') then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'topic', s.topic, 'summary', s.summary,
                                                       'documents', coalesce((s.meta ->> 'documents')::int, (select count(*) from ais_set_txns x where x.set_id = s.id)),
                                                       'mode', s.open_mode,
                                                       'started', (select t.id from tenants t join ais_instances i on i.tenant_id = t.id where t.owner_id = auth.uid() and i.set_id = s.id limit 1))
                                         order by s.title)
                     from ais_sets s where s.open), '[]'::jsonb);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_start_set(p_set text)
returns uuid as $$
declare
  me uuid := auth.uid(); s ais_sets%rowtype; t uuid; nm text; fy date; inst uuid; who text;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if is_teacher() then raise exception 'Teachers create companies on the AIS companies page.'; end if;
  if access_blocked() then raise exception 'Your account is waiting for your teacher''s approval.'; end if;
  if not has_module('ais') then raise exception 'Your teacher has not given you access to that system.'; end if;
  if coalesce((select enabled from edition_settings where edition = 'AIS'), false) = false then raise exception 'The AIS edition has not been opened by your teacher yet.'; end if;
  select * into s from ais_sets where id = p_set and open;
  if not found then raise exception 'That practice set is not open.'; end if;

  select t0.id into t from tenants t0 join ais_instances i on i.tenant_id = t0.id where t0.owner_id = me and i.set_id = p_set limit 1;
  if t is null then
    select coalesce(nullif(trim(full_name), ''), 'Student') into who from profiles where id = me;
    nm := left(who || ' - ' || coalesce(s.topic, s.title), 80);
    fy := date_trunc('year', coalesce(nullif(s.meta ->> 'period', '') || '-01', to_char(current_date, 'YYYY-01-01'))::date)::date;
    t := ais__make_company(nm, fy);
    update ais_company_settings set allow_solo = true where tenant_id = t;
    insert into memberships (user_id, tenant_id) values (me, t) on conflict do nothing;
    insert into ais_company_roles (tenant_id, user_id, seat, assigned_by) values (t, me, 'ACCOUNTING', me), (t, me, 'AUDIT', me);
    insert into ais_instances (tenant_id, set_id, seed, mode, lock_date, created_by)
    values (t, p_set, floor(random() * 2147483647)::bigint, s.open_mode, s.open_lock, me) returning id into inst;
    perform ais__instantiate(inst);
  end if;
  insert into edition_last_used (user_id, edition, tenant_id) values (me, 'AIS', t)
    on conflict (user_id, edition) do update set tenant_id = excluded.tenant_id, opened_at = now();
  update profiles set tenant_id = t where id = me;
  return t;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function ais_set_open(text, boolean, text, date) from public, anon;
revoke execute on function ais_open_state() from public, anon;
revoke execute on function ais_open_sets() from public, anon;
revoke execute on function ais_start_set(text) from public, anon;
grant execute on function ais_set_open(text, boolean, text, date) to authenticated;
grant execute on function ais_open_state() to authenticated;
grant execute on function ais_open_sets() to authenticated;
grant execute on function ais_start_set(text) to authenticated;
