-- ============================================================
-- Classroom ERP — upgrade migration 0005
-- Restricts the Teacher role to one specific email address,
-- regardless of what a signup form claims. This closes the gap
-- where anyone could pick "Teacher" at signup and see every
-- company's books.
-- ============================================================

create or replace function handle_new_user()
returns trigger as $$
declare
  assigned_role text;
begin
  if lower(new.email) = 'delacruz.johnjohnell@gmail.com' then
    assigned_role := 'teacher';
  else
    assigned_role := 'student';
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    assigned_role
  );
  return new;
end;
$$ language plpgsql security definer;

-- Make sure that account is (and stays) the teacher, even if it signed up before this rule existed.
update profiles set role = 'teacher'
where id in (select id from auth.users where lower(email) = 'delacruz.johnjohnell@gmail.com');

-- Demote any OTHER accounts that ended up with the teacher role during earlier testing
-- (e.g. teacher@test.com) — from here on, only the email above can see every company.
update profiles set role = 'student'
where role = 'teacher'
  and id not in (select id from auth.users where lower(email) = 'delacruz.johnjohnell@gmail.com');
