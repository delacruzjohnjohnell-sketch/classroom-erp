-- ============================================================
-- Classroom ERP — upgrade migration 0013
-- Wraps handle_new_user() in exception handling. Previously, if
-- the profile insert failed for any reason (bad metadata, a
-- constraint violation, etc.) the signup died with a generic,
-- unhelpful Postgres/Supabase error and no indication the auth
-- trigger was the cause (see AUDIT.md, "Real problems" #3).
--
-- This keeps the exact role-restriction logic from migration
-- 0005 (only the configured teacher email gets the teacher role)
-- and adds:
--   - a RAISE WARNING with the real error, visible in Supabase's
--     Postgres logs, so a teacher/admin can actually debug it
--   - a RAISE EXCEPTION with a short, human-readable message,
--     so the person signing up sees *something* actionable
--     instead of a bare constraint-violation string
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

  begin
    insert into public.profiles (id, full_name, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      assigned_role
    );
  exception when others then
    raise warning 'handle_new_user: profile insert failed for % (auth id %): % (sqlstate %)',
      new.email, new.id, sqlerrm, sqlstate;
    raise exception 'Could not finish setting up your account. Please try again, or ask your teacher for help if this keeps happening.';
  end;

  return new;
end;
$$ language plpgsql security definer;
