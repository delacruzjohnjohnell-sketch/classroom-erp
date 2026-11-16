-- ============================================================
-- 0090  AIS: the teacher builds a team in one step by ticking students and their roles
--
--   ais_create_team(name, fiscal_year_start, members)   teacher only. members is a list of {"user": <student id>, "seats": ["ACCOUNTING"], ["AUDIT"] or both}.
--                                                       Creates the AIS company and seats every ticked student in it, all or nothing (one transaction), so a team is never
--                                                       half made. A student ticked for both roles holds both seats; that turns on solo practice for the company.
--   ais_students_with_teams()                           teacher only. The approved students who may use AIS, each with the names of the teams they already hold a seat in,
--                                                       so the form can warn before a student is put in a second team.
--
-- Uses the existing ais_create_company, ais_set_solo and ais_set_seats (their teacher checks apply). Nothing is changed in those.
--
-- ROLLBACK: drop function ais_create_team(text, date, jsonb), ais_students_with_teams().
-- ============================================================

create or replace function ais_create_team(p_name text, p_fiscal_year_start date, p_members jsonb)
returns uuid as $$
declare
  t uuid; m jsonb; seats text[]; both_seats boolean := false; seen uuid[] := array[]::uuid[]; u uuid;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can create a team.'; end if;
  if jsonb_typeof(p_members) is distinct from 'array' or jsonb_array_length(p_members) = 0 then raise exception 'Tick at least one student.'; end if;
  for m in select value from jsonb_array_elements(p_members) loop
    u := (m ->> 'user')::uuid;
    if u is null then raise exception 'Every member needs a student.'; end if;
    if u = any (seen) then raise exception 'A student can only be ticked once in a team.'; end if;
    seen := seen || u;
    seats := array(select jsonb_array_elements_text(coalesce(m -> 'seats', '[]'::jsonb)));
    if coalesce(array_length(seats, 1), 0) = 0 then raise exception 'Give every ticked student a role: Accounting, Audit, or both.'; end if;
    if 'ACCOUNTING' = any (seats) and 'AUDIT' = any (seats) then both_seats := true; end if;
  end loop;

  t := ais_create_company(p_name, p_fiscal_year_start);
  if both_seats then perform ais_set_solo(t, true); end if;
  for m in select value from jsonb_array_elements(p_members) loop
    perform ais_set_seats(t, (m ->> 'user')::uuid, array(select jsonb_array_elements_text(m -> 'seats')));
  end loop;
  return t;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function ais_students_with_teams()
returns jsonb as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see this.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name,
                                        'teams', coalesce((select jsonb_agg(t.name order by t.created_at) from ais_company_roles r join tenants t on t.id = r.tenant_id where r.user_id = p.id), '[]'::jsonb))
                     order by coalesce(nullif(trim(p.full_name), ''), 'zzz'), p.id)
      from profiles p where p.role = 'student' and p.approval = 'approved' and 'ais' = any (p.modules)), '[]'::jsonb);
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function ais_create_team(text, date, jsonb) from public, anon;
revoke execute on function ais_students_with_teams() from public, anon;
grant execute on function ais_create_team(text, date, jsonb) to authenticated;
grant execute on function ais_students_with_teams() to authenticated;
