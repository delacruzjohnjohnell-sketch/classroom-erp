-- ============================================================
-- Classroom ERP — migration 0083 (BFAR: student submissions and teacher checking)
--
-- Needs profiles(id, full_name, role). Adds ONE table and four functions; nothing existing is altered.
--
--   bfar_submissions   one row per student per practice set: the student's answers, whether they were submitted, and what the teacher marked.
--                      RLS is on with no policies, so nobody reads or writes it directly; only the functions below do.
--   bfar_my(set)                       the caller's own row. The teacher's marking (checked, score, comment) is only returned once the teacher released it.
--   bfar_save(set, answers, submit)    save a draft or submit. Not allowed once the teacher released the result.
--   bfar_teacher_list()                TEACHER ONLY. Every submission with the student's name and the answers.
--   bfar_teacher_check(id, ...)        TEACHER ONLY. Store the teacher's marking and optionally release it to the student.
-- The solution keys are not stored here; the teacher's browser grades and sends the marked result, so a student cannot read a key from the database.
-- ROLLBACK: drop function bfar_teacher_check(uuid, jsonb, int, int, text, boolean), bfar_teacher_list(), bfar_save(text, jsonb, boolean), bfar_my(text), bfar__is_teacher(); drop table bfar_submissions;
-- ============================================================

create table if not exists bfar_submissions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  set_id       text not null,
  answers      jsonb not null default '{}'::jsonb,
  status       text not null default 'draft' check (status in ('draft', 'submitted', 'released')),
  submitted_at timestamptz,
  checked      jsonb,
  score        int,
  max_score    int,
  comment      text,
  released_at  timestamptz,
  updated_at   timestamptz not null default now(),
  unique (user_id, set_id)
);
alter table bfar_submissions enable row level security;

create or replace function bfar__is_teacher() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'teacher');
$$ language sql stable security definer set search_path = public;

create or replace function bfar_my(p_set text)
returns table (status text, answers jsonb, submitted_at timestamptz, checked jsonb, score int, max_score int, comment text) as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return query
    select s.status, s.answers, s.submitted_at,
           case when s.status = 'released' then s.checked end,
           case when s.status = 'released' then s.score end,
           case when s.status = 'released' then s.max_score end,
           case when s.status = 'released' then s.comment end
    from bfar_submissions s where s.user_id = auth.uid() and s.set_id = p_set;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function bfar_save(p_set text, p_answers jsonb, p_submit boolean)
returns text as $$
declare cur text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select status into cur from bfar_submissions where user_id = auth.uid() and set_id = p_set;
  if cur = 'released' then raise exception 'Your teacher already checked this set.'; end if;
  insert into bfar_submissions (user_id, set_id, answers, status, submitted_at, updated_at)
  values (auth.uid(), p_set, coalesce(p_answers, '{}'::jsonb), case when p_submit then 'submitted' else 'draft' end, case when p_submit then now() end, now())
  on conflict (user_id, set_id) do update
    set answers = excluded.answers,
        status = case when p_submit then 'submitted' else 'draft' end,
        submitted_at = case when p_submit then now() else bfar_submissions.submitted_at end,
        updated_at = now();
  return case when p_submit then 'submitted' else 'draft' end;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function bfar_teacher_list()
returns table (id uuid, student text, set_id text, status text, answers jsonb, submitted_at timestamptz, checked jsonb, score int, max_score int, comment text, updated_at timestamptz) as $$
begin
  if not bfar__is_teacher() then raise exception 'Teachers only'; end if;
  return query
    select s.id, coalesce(p.full_name, 'Student'), s.set_id, s.status, s.answers, s.submitted_at, s.checked, s.score, s.max_score, s.comment, s.updated_at
    from bfar_submissions s left join profiles p on p.id = s.user_id
    order by s.status = 'submitted' desc, s.submitted_at desc nulls last, s.updated_at desc;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function bfar_teacher_check(p_id uuid, p_checked jsonb, p_score int, p_max int, p_comment text, p_release boolean)
returns text as $$
begin
  if not bfar__is_teacher() then raise exception 'Teachers only'; end if;
  update bfar_submissions
     set checked = p_checked, score = p_score, max_score = p_max, comment = p_comment,
         status = case when p_release then 'released' else status end,
         released_at = case when p_release then now() else released_at end,
         updated_at = now()
   where id = p_id;
  if not found then raise exception 'Submission not found'; end if;
  return case when p_release then 'released' else 'saved' end;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function bfar__is_teacher() from public;
grant execute on function bfar_my(text), bfar_save(text, jsonb, boolean), bfar_teacher_list(), bfar_teacher_check(uuid, jsonb, int, int, text, boolean) to authenticated;
