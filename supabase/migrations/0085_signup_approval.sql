-- ============================================================
-- Classroom ERP — migration 0085 (sign-up approval and per-student system access)
--
-- New sign-ups are PENDING until the teacher approves them and ticks which systems they may use.
-- Everyone already in the system is approved with every system (nothing changes for them).
-- NOT applied until the owner says "apply".
--
--   profiles.approval       'pending' | 'approved' | 'rejected'   (existing rows: approved)
--   profiles.modules        text[] of 'standard','manufacturing','ais','bfar','bir'   (existing rows: all five)
--   profiles.approval_note  the teacher's message shown to a rejected student
--   profiles.decided_at     when the teacher decided
--
--   has_module(m)           true for the teacher, and for an approved student who has module m
--   access_requests()       TEACHER ONLY: every student with email, status and ticked systems (pending first)
--   decide_student(...)     TEACHER ONLY: approve with ticked systems (also edits an approved student) or reject with a message
--   pending_count()         TEACHER ONLY: how many are waiting
--
-- Enforcement is in the database, not only on screen:
--   * a student cannot change their own approval/modules (trigger),
--   * a pending/rejected student cannot create a company, join one, or open an edition they were not given (triggers on tenants, memberships, tenant_editions, profiles.tenant_id),
--   * the BIR Lab and BFAR functions refuse a student without that module.
-- Teachers (one account, restricted by email in handle_new_user) and service-role calls (auth.uid() is null) bypass every check.
--
-- ROLLBACK: drop trigger trg_guard_profile_access on profiles; drop trigger trg_guard_profile_approval_tenant on profiles; drop trigger trg_access_tenants on tenants;
--           drop trigger trg_access_memberships on memberships; drop trigger trg_access_editions on tenant_editions;
--           drop function access_requests(), decide_student(uuid, boolean, text[], text), pending_count(), has_module(text), guard_profile_access(),
--           guard_profile_approval_tenant(), access_guard_tenant(), access_guard_membership(), access_guard_edition(), access_blocked();
--           alter table profiles drop column approval, drop column modules, drop column approval_note, drop column decided_at;
--           then restore handle_new_user() from migration 0013, and re-create bir_lab_*/bfar_* from migrations 0084/0083.
-- ============================================================

alter table profiles
  add column if not exists approval text not null default 'approved' check (approval in ('pending', 'approved', 'rejected')),
  add column if not exists modules text[] not null default array['standard', 'manufacturing', 'ais', 'bfar', 'bir'],
  add column if not exists approval_note text,
  add column if not exists decided_at timestamptz;

-- ---- who may use a system -------------------------------------------------------------------------------------------------------------------------
create or replace function has_module(m text) returns boolean as $$
  select coalesce((select role = 'teacher' or (approval = 'approved' and m = any (modules)) from profiles where id = auth.uid()), false);
$$ language sql stable security definer set search_path = public;

-- ---- new sign-ups start pending (the teacher e-mail rule from 0005/0013 is kept) -----------------------------------------------------------------
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
    insert into public.profiles (id, full_name, role, approval, modules)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'full_name', new.email),
      assigned_role,
      case when assigned_role = 'teacher' then 'approved' else 'pending' end,
      case when assigned_role = 'teacher' then array['standard', 'manufacturing', 'ais', 'bfar', 'bir'] else array[]::text[] end
    );
  exception when others then
    raise warning 'handle_new_user: profile insert failed for % (auth id %): % (sqlstate %)', new.email, new.id, sqlerrm, sqlstate;
    raise exception 'Could not finish setting up your account. Please try again, or ask your teacher for help if this keeps happening.';
  end;

  return new;
end;
$$ language plpgsql security definer;

-- ---- a student cannot approve themselves ----------------------------------------------------------------------------------------------------------
create or replace function guard_profile_access() returns trigger as $$
begin
  if (new.approval is distinct from old.approval or new.modules is distinct from old.modules
      or new.approval_note is distinct from old.approval_note or new.decided_at is distinct from old.decided_at)
     and auth.uid() is not null and is_teacher() is not true then
    raise exception 'Only your teacher can change your access.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_guard_profile_access on profiles;
create trigger trg_guard_profile_access before update on profiles for each row execute function guard_profile_access();

-- ---- a waiting or rejected student cannot get into any company ------------------------------------------------------------------------------------
create or replace function access_blocked() returns boolean as $$
  select auth.uid() is not null and exists (select 1 from profiles where id = auth.uid() and role <> 'teacher' and approval <> 'approved');
$$ language sql stable security definer set search_path = public;

create or replace function guard_profile_approval_tenant() returns trigger as $$
begin
  if new.tenant_id is distinct from old.tenant_id and new.approval <> 'approved' and auth.uid() is not null and is_teacher() is not true then
    raise exception 'Your account is waiting for your teacher''s approval.';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_guard_profile_approval_tenant on profiles;
create trigger trg_guard_profile_approval_tenant before update on profiles for each row execute function guard_profile_approval_tenant();

create or replace function access_guard_tenant() returns trigger as $$
begin
  if access_blocked() then raise exception 'Your account is waiting for your teacher''s approval.'; end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_access_tenants on tenants;
create trigger trg_access_tenants before insert on tenants for each row execute function access_guard_tenant();

create or replace function access_guard_membership() returns trigger as $$
declare ed text;
begin
  if auth.uid() is null or is_teacher() is true then return new; end if;
  if access_blocked() then raise exception 'Your account is waiting for your teacher''s approval.'; end if;
  select lower(edition) into ed from tenant_editions where tenant_id = new.tenant_id;
  if not has_module(coalesce(ed, 'standard')) then raise exception 'Your teacher has not given you access to that system.'; end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_access_memberships on memberships;
create trigger trg_access_memberships before insert on memberships for each row execute function access_guard_membership();

create or replace function access_guard_edition() returns trigger as $$
begin
  if auth.uid() is null or is_teacher() is true then return new; end if;
  if access_blocked() then raise exception 'Your account is waiting for your teacher''s approval.'; end if;
  if not has_module(lower(new.edition)) then raise exception 'Your teacher has not given you access to that system.'; end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
drop trigger if exists trg_access_editions on tenant_editions;
create trigger trg_access_editions before insert on tenant_editions for each row execute function access_guard_edition();

-- ---- the teacher's approvals ----------------------------------------------------------------------------------------------------------------------
create or replace function access_requests()
returns table (id uuid, full_name text, email text, created_at timestamptz, approval text, modules text[], approval_note text, decided_at timestamptz) as $$
begin
  if is_teacher() is not true then raise exception 'Teachers only'; end if;
  return query
    select p.id, coalesce(p.full_name, ''), coalesce(u.email, '')::text, p.created_at, p.approval, p.modules, p.approval_note, p.decided_at
    from profiles p left join auth.users u on u.id = p.id
    where p.role = 'student'
    order by case p.approval when 'pending' then 0 when 'rejected' then 2 else 1 end, p.created_at desc;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function decide_student(p_user uuid, p_approve boolean, p_modules text[], p_note text)
returns text as $$
declare mods text[];
begin
  if is_teacher() is not true then raise exception 'Teachers only'; end if;
  if not exists (select 1 from profiles where id = p_user and role = 'student') then raise exception 'Student not found'; end if;
  if p_approve then
    mods := coalesce(p_modules, array[]::text[]);
    if array_length(mods, 1) is null then raise exception 'Tick at least one system.'; end if;
    if exists (select 1 from unnest(mods) m where m not in ('standard', 'manufacturing', 'ais', 'bfar', 'bir')) then raise exception 'Unknown system.'; end if;
    update profiles set approval = 'approved', modules = mods, approval_note = null, decided_at = now() where id = p_user;
    return 'approved';
  end if;
  update profiles set approval = 'rejected', modules = array[]::text[], approval_note = nullif(trim(coalesce(p_note, '')), ''), decided_at = now() where id = p_user;
  return 'rejected';
end;
$$ language plpgsql security definer set search_path = public;

create or replace function pending_count() returns int as $$
begin
  if is_teacher() is not true then raise exception 'Teachers only'; end if;
  return (select count(*)::int from profiles where role = 'student' and approval = 'pending');
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---- the BIR Lab and BFAR refuse a student without that module -----------------------------------------------------------------------------------
do $$
declare r record; def text; mod text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('bir_lab_log_attempt', 'bir_lab_my_attempts', 'bfar_my', 'bfar_save') loop
    mod := case when r.proname like 'bir_lab%' then 'bir' else 'bfar' end;
    def := pg_get_functiondef(r.oid);
    if def not like '%has_module(%' then
      def := regexp_replace(def, E'\nbegin\n', E'\nbegin\n  if not has_module(''' || mod || E''') then raise exception ''Your teacher has not given you access to this system.''; end if;\n');
      execute def;
    end if;
  end loop;
end;
$$;

grant execute on function has_module(text), access_requests(), decide_student(uuid, boolean, text[], text), pending_count() to authenticated;
