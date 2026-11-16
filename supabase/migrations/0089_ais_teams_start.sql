-- ============================================================
-- 0089  AIS: an open practice set is started by the TEAM the teacher assigned, not by a student alone
--
-- 0088 let every student start an open set in a new solo company. The teacher wants to assign the teams herself (an Accounting student and an Audit student in an
-- AIS company, on the AIS companies page) and then open the set: the team starts it from its own company.
--
--   ais_start_set(set, tenant default null)   a member of an AIS company with a seat in it starts the open set for that company (the company the student is in that has no
--                                             practice set yet, or the one given). The company, its seats and its members stay as the teacher made them. Any member can start;
--                                             the team gets one set, one seed and one set of numbers. Starting again returns the same company. A company that already has a
--                                             set cannot start another: the teacher's "Start a new round" does that, as before. A student in no team is told to ask the teacher.
--   ais_open_sets()                           each open set, whether one of the student's teams has started it, and the team that could start it (null: no team yet)
--   ais_open_state()                          the number started counts every company that has the set
--   ais__make_company                         dropped (the solo path is gone)
--
-- ROLLBACK: re-run 0088's ais_start_set, ais_open_sets, ais_open_state and ais__make_company.
-- ============================================================

drop function if exists ais_start_set(text);
drop function if exists ais__make_company(text, date);

create or replace function ais_open_state()
returns jsonb as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see this.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'open', s.open, 'mode', s.open_mode, 'lock', s.open_lock,
                                                       'started', (select count(*) from ais_instances i where i.set_id = s.id)))
                     from ais_sets s), '[]'::jsonb);
end;
$$ language plpgsql stable security definer set search_path = public;

-- the AIS company this student is in with a seat and no practice set yet (newest first)
create or replace function ais__my_free_team(p_user uuid)
returns table (id uuid, name text) as $$
  select t.id, t.name
    from tenants t
    join memberships m on m.tenant_id = t.id and m.user_id = p_user
    join tenant_editions e on e.tenant_id = t.id and e.edition = 'AIS'
   where exists (select 1 from ais_company_roles r where r.tenant_id = t.id and r.user_id = p_user)
     and not exists (select 1 from ais_instances i where i.tenant_id = t.id)
   order by t.created_at desc
   limit 1;
$$ language sql stable security definer set search_path = public;
revoke execute on function ais__my_free_team(uuid) from public, anon, authenticated;

create or replace function ais_open_sets()
returns jsonb as $$
declare
  me uuid := auth.uid(); team jsonb;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if is_teacher() or access_blocked() or not has_module('ais') then return '[]'::jsonb; end if;
  select jsonb_build_object('id', f.id, 'name', f.name) into team from ais__my_free_team(me) f;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'topic', s.topic, 'summary', s.summary,
                                                       'documents', coalesce((s.meta ->> 'documents')::int, (select count(*) from ais_set_txns x where x.set_id = s.id)),
                                                       'mode', s.open_mode, 'team', team,
                                                       'started', (select i.tenant_id from ais_instances i join memberships m on m.tenant_id = i.tenant_id and m.user_id = me where i.set_id = s.id limit 1))
                                         order by s.title)
                     from ais_sets s where s.open), '[]'::jsonb);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_start_set(p_set text, p_tenant uuid default null)
returns uuid as $$
declare
  me uuid := auth.uid(); s ais_sets%rowtype; t uuid; inst uuid;
begin
  if me is null then raise exception 'Sign in first.'; end if;
  if is_teacher() then raise exception 'Teachers assign the teams and open the set; the teams start it.'; end if;
  if access_blocked() then raise exception 'Your account is waiting for your teacher''s approval.'; end if;
  if not has_module('ais') then raise exception 'Your teacher has not given you access to that system.'; end if;
  if coalesce((select enabled from edition_settings where edition = 'AIS'), false) = false then raise exception 'The AIS edition has not been opened by your teacher yet.'; end if;
  select * into s from ais_sets where id = p_set and open;
  if not found then raise exception 'That practice set is not open.'; end if;

  -- a team of mine already has this set: go back to it
  select i.tenant_id into t from ais_instances i join memberships m on m.tenant_id = i.tenant_id and m.user_id = me where i.set_id = p_set limit 1;
  if t is null then
    if p_tenant is null then select f.id into t from ais__my_free_team(me) f;
    elsif exists (select 1 from memberships m join tenant_editions e on e.tenant_id = m.tenant_id and e.edition = 'AIS'
                   where m.user_id = me and m.tenant_id = p_tenant and exists (select 1 from ais_company_roles r where r.tenant_id = p_tenant and r.user_id = me)) then t := p_tenant;
    end if;
    if t is null then raise exception 'Your teacher has not put you in an AIS team yet, or your team already has a practice set. Ask your teacher.'; end if;
    perform pg_advisory_xact_lock(hashtext(t::text));
    if exists (select 1 from ais_instances where tenant_id = t) then
      if exists (select 1 from ais_instances where tenant_id = t and set_id = p_set) then null;                                     -- a teammate started it a moment ago
      else raise exception 'Your team already has a practice set. Your teacher can start a new round.'; end if;
    else
      insert into ais_instances (tenant_id, set_id, seed, mode, lock_date, created_by)
      values (t, p_set, floor(random() * 2147483647)::bigint, s.open_mode, s.open_lock, me) returning id into inst;
      perform ais__instantiate(inst);
    end if;
  end if;
  insert into edition_last_used (user_id, edition, tenant_id) values (me, 'AIS', t)
    on conflict (user_id, edition) do update set tenant_id = excluded.tenant_id, opened_at = now();
  update profiles set tenant_id = t where id = me;
  return t;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function ais_start_set(text, uuid) from public, anon;
grant execute on function ais_start_set(text, uuid) to authenticated;
