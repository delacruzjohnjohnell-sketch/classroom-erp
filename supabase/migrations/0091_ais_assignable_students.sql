-- ============================================================
-- 0091  AIS: only students the teacher ticked for the AIS system can be put in a team
--
-- 26 students existed before sign-up approvals (0085) and were given every system automatically; they were never ticked. The teacher wants teams made only from the
-- students she ticked for AIS in Sign-up approvals. "Ticked" means: an approved student with the AIS system and a recorded decision (decided_at is set by decide_student,
-- including a later "Save access" on an older student, which is how an earlier student is made assignable).
--
--   ais__eligible(user)             true for such a student (internal)
--   ais_students_with_teams()       the team form's list: eligible students only
--   ais_class_students()            the "add a student" list and the pair dropdowns: eligible students only
--   ais_set_seats(...)              refuses a student who is not eligible, unless they are already a member of that company (so seats of existing members can still be changed).
--                                   ais_create_team, the pair form and the bulk create all go through it.
--
-- ROLLBACK: re-run the 0090 definition of ais_students_with_teams, the earlier ais_class_students (all students) and ais_set_seats without the eligibility check; drop ais__eligible(uuid).
-- ============================================================

create or replace function ais__eligible(p_user uuid)
returns boolean as $$
  select exists (select 1 from profiles p where p.id = p_user and p.role = 'student' and p.approval = 'approved' and 'ais' = any (p.modules) and p.decided_at is not null);
$$ language sql stable security definer set search_path = public;
revoke execute on function ais__eligible(uuid) from public, anon, authenticated;

create or replace function ais_students_with_teams()
returns jsonb as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see this.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name,
                                        'teams', coalesce((select jsonb_agg(t.name order by t.created_at) from ais_company_roles r join tenants t on t.id = r.tenant_id where r.user_id = p.id), '[]'::jsonb))
                     order by coalesce(nullif(trim(p.full_name), ''), 'zzz'), p.id)
      from profiles p where ais__eligible(p.id)), '[]'::jsonb);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function ais_class_students()
returns table (id uuid, full_name text) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the class list.'; end if;
  return query select p.id, p.full_name from profiles p where ais__eligible(p.id) order by p.full_name nulls last;
end;
$$ language plpgsql stable security definer set search_path = public;

do $do$
declare
  d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ais_set_seats';
  if d is null then raise exception 'ais_set_seats was not found'; end if;
  n := replace(d, 'raise exception ''Choose a student.''; end if;',
    'raise exception ''Choose a student.''; end if;' || E'\n' ||
    '  if not ais__eligible(p_user) and not exists (select 1 from memberships where tenant_id = p_tenant and user_id = p_user) then' || E'\n' ||
    '    raise exception ''That student has not been given the AIS system. Tick it for them in Sign-up approvals first.''; end if;');
  if n = d then raise exception 'ais_set_seats did not contain the expected text; nothing changed'; end if;
  execute n;
end
$do$;
