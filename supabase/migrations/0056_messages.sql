-- ============================================================
-- Classroom ERP — migration 0056 (in-app messages between the teacher and students or teams)
--
-- ADDITIVE ONLY: three new tables and new functions. Nothing existing is changed. No email is sent: messages live in the app (an inbox with an
-- unread count). Email can be added later by reading msg_posts.
--
--   A thread is addressed to the whole class, to one team company, or to one student. The teacher starts those; a student can start a thread to
--   the teacher. Everyone in a thread (and the teacher, always) can reply. A student sees only the threads they belong to.
--
--   msg_threads, msg_posts, msg_members   the data; no policies, so nobody reads them directly: only the functions below do.
--   msg_targets()                         Teacher: the students and team companies a message can be addressed to.
--   msg_send(audience, target, subject, body)   Teacher: start a thread ('CLASS' | 'TEAM' | 'STUDENT').
--   msg_student_start(subject, body)      Student: start a thread to the teacher.
--   msg_reply(thread, body)               Teacher or a member of the thread.
--   msg_inbox()                           My threads, newest first, with the last message and whether it is unread.
--   msg_thread(thread)                    One thread with its posts; marks it read for me.
--   msg_unread_count()                    How many threads have something I have not read.
--
-- ROLLBACK:  drop function if exists msg_unread_count(), msg_thread(uuid), msg_inbox(), msg_reply(uuid, text), msg_student_start(text, text),
--              msg_send(text, uuid, text, text), msg_targets(), msg__can(uuid, uuid); drop table if exists msg_members, msg_posts, msg_threads;
-- ============================================================

create table if not exists msg_threads (
  id           uuid primary key default gen_random_uuid(),
  subject      text not null check (length(trim(subject)) between 1 and 120),
  audience     text not null check (audience in ('CLASS', 'TEAM', 'STUDENT')),
  tenant_id    uuid references tenants(id) on delete cascade,     -- the team company, for 'TEAM'
  student_id   uuid references auth.users(id) on delete cascade,  -- the student, for 'STUDENT'
  created_by   uuid not null,
  created_at   timestamptz not null default now(),
  last_post_at timestamptz not null default now()
);
create table if not exists msg_posts (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references msg_threads(id) on delete cascade,
  sender_id  uuid not null,
  body       text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create table if not exists msg_members (
  thread_id    uuid not null references msg_threads(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);
create index if not exists msg_posts_thread on msg_posts (thread_id, created_at);
create index if not exists msg_members_user on msg_members (user_id);
alter table msg_threads enable row level security;
alter table msg_posts enable row level security;
alter table msg_members enable row level security;

-- may this user see this thread? the teacher always; a student only as a member
create or replace function msg__can(p_thread uuid, p_user uuid)
returns boolean as $$
  select exists (select 1 from msg_threads t where t.id = p_thread)
     and (exists (select 1 from profiles p where p.id = p_user and p.role = 'teacher')
          or exists (select 1 from msg_members m where m.thread_id = p_thread and m.user_id = p_user));
$$ language sql stable security definer set search_path = public;
revoke execute on function msg__can(uuid, uuid) from public, anon, authenticated;

create or replace function msg_targets()
returns jsonb as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can address messages.'; end if;
  return jsonb_build_object(
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, 'Student')) order by p.full_name) from profiles p where p.role = 'student'), '[]'),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name) from mfg_teams m join tenants t on t.id = m.tenant_id), '[]'));
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function msg_send(p_audience text, p_target uuid, p_subject text, p_body text)
returns uuid as $$
declare
  v_id uuid; v_n int;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can send to a class, a team or a student.'; end if;
  if p_audience not in ('CLASS', 'TEAM', 'STUDENT') then raise exception 'Choose who the message is for.'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Give the message a subject.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a message.'; end if;
  if p_audience = 'TEAM' and not exists (select 1 from mfg_teams where tenant_id = p_target) then raise exception 'Choose a team company.'; end if;
  if p_audience = 'STUDENT' and not exists (select 1 from profiles where id = p_target and role = 'student') then raise exception 'Choose a student.'; end if;

  insert into msg_threads (subject, audience, tenant_id, student_id, created_by)
  values (trim(p_subject), p_audience, case when p_audience = 'TEAM' then p_target end, case when p_audience = 'STUDENT' then p_target end, auth.uid())
  returning id into v_id;

  insert into msg_members (thread_id, user_id)
  select v_id, u from (
    select p.id as u from profiles p where p_audience = 'CLASS' and p.role = 'student'
    union
    select m.user_id from memberships m join profiles p on p.id = m.user_id where p_audience = 'TEAM' and m.tenant_id = p_target and p.role = 'student'
    union
    select p_target where p_audience = 'STUDENT') x
  on conflict do nothing;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'There is nobody to send this to.'; end if;

  insert into msg_posts (thread_id, sender_id, body) values (v_id, auth.uid(), trim(p_body));
  insert into msg_members (thread_id, user_id, last_read_at) values (v_id, auth.uid(), now()) on conflict do nothing;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function msg_student_start(p_subject text, p_body text)
returns uuid as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if is_teacher() then raise exception 'Teachers use the send form.'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Give the message a subject.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a message.'; end if;
  insert into msg_threads (subject, audience, student_id, created_by) values (trim(p_subject), 'STUDENT', auth.uid(), auth.uid()) returning id into v_id;
  insert into msg_members (thread_id, user_id, last_read_at) values (v_id, auth.uid(), now());
  insert into msg_posts (thread_id, sender_id, body) values (v_id, auth.uid(), trim(p_body));
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function msg_reply(p_thread uuid, p_body text)
returns void as $$
begin
  if auth.uid() is null or not msg__can(p_thread, auth.uid()) then raise exception 'You can''t reply to that message.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a message.'; end if;
  insert into msg_posts (thread_id, sender_id, body) values (p_thread, auth.uid(), trim(p_body));
  update msg_threads set last_post_at = now() where id = p_thread;
  insert into msg_members (thread_id, user_id, last_read_at) values (p_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
end;
$$ language plpgsql security definer set search_path = public;

create or replace function msg_inbox()
returns table (thread_id uuid, subject text, audience text, audience_label text, last_post_at timestamptz, last_body text, last_sender text, posts bigint, unread boolean) as $$
declare
  v_me uuid := auth.uid(); v_teacher boolean := coalesce(is_teacher(), false);
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  return query
  select t.id, t.subject, t.audience,
         case t.audience when 'CLASS' then 'Whole class' when 'TEAM' then coalesce((select n.name from tenants n where n.id = t.tenant_id), 'Team')
              else coalesce((select p.full_name from profiles p where p.id = t.student_id), 'Student') end,
         t.last_post_at,
         lp.body, coalesce((select p.full_name from profiles p where p.id = lp.sender_id), 'Someone'),
         (select count(*) from msg_posts x where x.thread_id = t.id),
         exists (select 1 from msg_posts x left join msg_members m on m.thread_id = t.id and m.user_id = v_me
                  where x.thread_id = t.id and x.sender_id <> v_me and x.created_at > coalesce(m.last_read_at, '-infinity'::timestamptz))
    from msg_threads t
    join lateral (select b.body, b.sender_id from msg_posts b where b.thread_id = t.id order by b.created_at desc limit 1) lp on true
   where v_teacher or exists (select 1 from msg_members m where m.thread_id = t.id and m.user_id = v_me)
   order by t.last_post_at desc;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function msg_thread(p_thread uuid)
returns jsonb as $$
declare
  v_me uuid := auth.uid(); r jsonb;
begin
  if v_me is null or not msg__can(p_thread, v_me) then raise exception 'You can''t open that message.'; end if;
  select jsonb_build_object(
    'id', t.id, 'subject', t.subject, 'audience', t.audience,
    'audience_label', case t.audience when 'CLASS' then 'Whole class' when 'TEAM' then coalesce((select n.name from tenants n where n.id = t.tenant_id), 'Team')
                       else coalesce((select p.full_name from profiles p where p.id = t.student_id), 'Student') end,
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'sender', coalesce(p.full_name, 'Someone'), 'role', coalesce(p.role, ''), 'body', x.body, 'at', x.created_at, 'mine', x.sender_id = v_me) order by x.created_at)
                         from msg_posts x left join profiles p on p.id = x.sender_id where x.thread_id = t.id), '[]'))
    into r from msg_threads t where t.id = p_thread;
  insert into msg_members (thread_id, user_id, last_read_at) values (p_thread, v_me, now())
  on conflict (thread_id, user_id) do update set last_read_at = now();
  return r;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function msg_unread_count()
returns integer as $$
  select count(*)::int from msg_inbox() where unread;
$$ language sql stable security definer set search_path = public;

revoke execute on function msg_targets() from public, anon;
revoke execute on function msg_send(text, uuid, text, text) from public, anon;
revoke execute on function msg_student_start(text, text) from public, anon;
revoke execute on function msg_reply(uuid, text) from public, anon;
revoke execute on function msg_inbox() from public, anon;
revoke execute on function msg_thread(uuid) from public, anon;
revoke execute on function msg_unread_count() from public, anon;
grant execute on function msg_targets() to authenticated;
grant execute on function msg_send(text, uuid, text, text) to authenticated;
grant execute on function msg_student_start(text, text) to authenticated;
grant execute on function msg_reply(uuid, text) to authenticated;
grant execute on function msg_inbox() to authenticated;
grant execute on function msg_thread(uuid) to authenticated;
grant execute on function msg_unread_count() to authenticated;
