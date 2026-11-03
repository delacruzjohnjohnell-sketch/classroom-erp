-- ============================================================
-- Classroom ERP — migration 0084 (BIR eForms Lab: attempts)
--
-- Adds ONE table and three functions; nothing existing is altered. NOT applied until the owner says "apply".
--
--   bir_lab_attempts            one row per saved return or case attempt: who, which form, which case, practice or assessment, the filled values, the score.
--                               RLS is on with no policies, so nobody reads or writes it directly; only the functions below do.
--   bir_lab_log_attempt(...)    a student records an attempt (their own row only).
--   bir_lab_my_attempts()       the caller's own attempts, newest first.
--   bir_lab_teacher_list()      TEACHER ONLY. Every student's attempts with the student's name (for the instructor dashboard and CSV export).
-- ROLLBACK: drop function bir_lab_teacher_list(), bir_lab_my_attempts(), bir_lab_log_attempt(text, text, text, jsonb, int, int, boolean, int, boolean), bir_lab__is_teacher(); drop table bir_lab_attempts;
-- ============================================================

create table if not exists bir_lab_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  form_id     text not null,
  case_id     text not null default '',
  mode        text not null check (mode in ('practice', 'assessment', 'free')),
  "values"    jsonb not null default '{}'::jsonb,
  score       int not null default 0,
  max_score   int not null default 0,
  final       boolean not null default false,
  seconds     int not null default 0,
  wrong_form  boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table bir_lab_attempts enable row level security;
create index if not exists bir_lab_attempts_user_idx on bir_lab_attempts (user_id, created_at desc);

create or replace function bir_lab__is_teacher() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'teacher');
$$ language sql stable security definer set search_path = public;

create or replace function bir_lab_log_attempt(p_form text, p_case text, p_mode text, p_values jsonb, p_score int, p_max int, p_final boolean, p_seconds int, p_wrong_form boolean)
returns uuid as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into bir_lab_attempts (user_id, form_id, case_id, mode, "values", score, max_score, final, seconds, wrong_form)
  values (auth.uid(), p_form, coalesce(p_case, ''), p_mode, coalesce(p_values, '{}'::jsonb), greatest(p_score, 0), greatest(p_max, 0), coalesce(p_final, false), greatest(coalesce(p_seconds, 0), 0), coalesce(p_wrong_form, false))
  returning id into new_id;
  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function bir_lab_my_attempts()
returns table (id uuid, form_id text, case_id text, mode text, score int, max_score int, final boolean, seconds int, wrong_form boolean, created_at timestamptz) as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return query select a.id, a.form_id, a.case_id, a.mode, a.score, a.max_score, a.final, a.seconds, a.wrong_form, a.created_at
               from bir_lab_attempts a where a.user_id = auth.uid() order by a.created_at desc limit 200;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function bir_lab_teacher_list()
returns table (id uuid, student text, form_id text, case_id text, mode text, score int, max_score int, final boolean, seconds int, wrong_form boolean, created_at timestamptz) as $$
begin
  if not bir_lab__is_teacher() then raise exception 'Teachers only'; end if;
  return query select a.id, coalesce(p.full_name, 'Student'), a.form_id, a.case_id, a.mode, a.score, a.max_score, a.final, a.seconds, a.wrong_form, a.created_at
               from bir_lab_attempts a left join profiles p on p.id = a.user_id order by a.created_at desc limit 2000;
end;
$$ language plpgsql stable security definer set search_path = public;

revoke all on function bir_lab__is_teacher() from public;
grant execute on function bir_lab_log_attempt(text, text, text, jsonb, int, int, boolean, int, boolean), bir_lab_my_attempts(), bir_lab_teacher_list() to authenticated;
