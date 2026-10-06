-- ============================================================
-- Classroom ERP — upgrade migration 0019
-- Audit finding (critical): the "update own profile" policy has no column
-- limit, so any signed-in student could run
--     update profiles set role = 'teacher' where id = auth.uid()
-- and become a teacher, which reads every company and can approve or
-- delete anything. The app never changes a role after signup.
--
-- Only an existing teacher (or the database owner, where there is no
-- signed-in user) may change a role.
-- ============================================================

create or replace function guard_profile_role()
returns trigger as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and is_teacher() is not true then
    raise exception 'Your role can''t be changed.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_guard_profile_role before update on profiles
  for each row execute function guard_profile_role();

revoke execute on function guard_profile_role() from public, anon, authenticated;
