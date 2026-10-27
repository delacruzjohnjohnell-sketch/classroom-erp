-- ============================================================
-- Classroom ERP — migration 0057 (a group chat for every team company, with each member's role shown)
--
-- Needs 0049 and 0056. ADDITIVE: one new column on msg_threads, one index, and our own msg_* functions are redefined. Nothing else is touched.
--
--   Every team company gets ONE standing group chat (kind = 'TEAMCHAT'), created the first time anyone in it (or the teacher) opens Messages.
--   Who is in it is not copied: it is whoever belongs to the team company right now (memberships), plus the teacher, so a student added later
--   joins the chat and a student removed from the team leaves it. Each message in a team chat carries the sender's role label in that team
--   (for example "Accountant, Purchasing officer"), or "Teacher".
--   The teacher's "message a team" now posts into that team's chat instead of starting a separate thread.
--
-- ROLLBACK:  re-run the function definitions in 0056; drop index if exists msg_threads_one_chat; alter table msg_threads drop column if exists kind;
--            drop function if exists msg__label(uuid, uuid), msg__team_chat(uuid, uuid);
-- ============================================================

alter table msg_threads add column if not exists kind text not null default 'MESSAGE' check (kind in ('MESSAGE', 'TEAMCHAT'));
create unique index if not exists msg_threads_one_chat on msg_threads (tenant_id) where kind = 'TEAMCHAT';

-- the role label shown beside a name in a team: the teacher, or the member's roles in that team
create or replace function msg__label(p_tenant uuid, p_user uuid)
returns text as $$
  select case
    when exists (select 1 from profiles p where p.id = p_user and p.role = 'teacher') then 'Teacher'
    else (select string_agg(mfg_role_label(r.role), ', ' order by r.role) from mfg_company_roles r where r.tenant_id = p_tenant and r.user_id = p_user)
  end;
$$ language sql stable security definer set search_path = public;
revoke execute on function msg__label(uuid, uuid) from public, anon, authenticated;

-- the team's chat thread, made on first use
create or replace function msg__team_chat(p_tenant uuid, p_by uuid)
returns uuid as $$
declare
  v_id uuid;
begin
  select id into v_id from msg_threads where tenant_id = p_tenant and kind = 'TEAMCHAT';
  if v_id is null then
    insert into msg_threads (subject, audience, tenant_id, created_by, kind)
    values ((select name from tenants where id = p_tenant) || ' — team chat', 'TEAM', p_tenant, p_by, 'TEAMCHAT')
    on conflict do nothing returning id into v_id;
    if v_id is null then select id into v_id from msg_threads where tenant_id = p_tenant and kind = 'TEAMCHAT'; end if;
  end if;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;
revoke execute on function msg__team_chat(uuid, uuid) from public, anon, authenticated;

-- may this user see this thread? the teacher always; a team chat: anyone in that team company; any other thread: its members
create or replace function msg__can(p_thread uuid, p_user uuid)
returns boolean as $$
  select exists (select 1 from msg_threads t where t.id = p_thread)
     and (exists (select 1 from profiles p where p.id = p_user and p.role = 'teacher')
          or case when exists (select 1 from msg_threads t where t.id = p_thread and t.kind = 'TEAMCHAT')
                  then exists (select 1 from msg_threads t join memberships ms on ms.tenant_id = t.tenant_id where t.id = p_thread and ms.user_id = p_user)   -- a team chat follows the team, never a stored list
                  else exists (select 1 from msg_members m where m.thread_id = p_thread and m.user_id = p_user) end);
$$ language sql stable security definer set search_path = public;
revoke execute on function msg__can(uuid, uuid) from public, anon, authenticated;

-- the teacher's message to a team goes into the team's chat
create or replace function msg_send(p_audience text, p_target uuid, p_subject text, p_body text)
returns uuid as $$
declare
  v_id uuid; v_n int;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can send to a class, a team or a student.'; end if;
  if p_audience not in ('CLASS', 'TEAM', 'STUDENT') then raise exception 'Choose who the message is for.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write a message.'; end if;

  if p_audience = 'TEAM' then
    if not exists (select 1 from mfg_teams where tenant_id = p_target) then raise exception 'Choose a team company.'; end if;
    v_id := msg__team_chat(p_target, auth.uid());
    insert into msg_posts (thread_id, sender_id, body)
    values (v_id, auth.uid(), case when coalesce(trim(p_subject), '') = '' then trim(p_body) else trim(p_subject) || E'\n\n' || trim(p_body) end);
    update msg_threads set last_post_at = now() where id = v_id;
    insert into msg_members (thread_id, user_id, last_read_at) values (v_id, auth.uid(), now()) on conflict (thread_id, user_id) do update set last_read_at = now();
    return v_id;
  end if;

  if coalesce(trim(p_subject), '') = '' then raise exception 'Give the message a subject.'; end if;
  if p_audience = 'STUDENT' and not exists (select 1 from profiles where id = p_target and role = 'student') then raise exception 'Choose a student.'; end if;

  insert into msg_threads (subject, audience, tenant_id, student_id, created_by)
  values (trim(p_subject), p_audience, null, case when p_audience = 'STUDENT' then p_target end, auth.uid())
  returning id into v_id;

  insert into msg_members (thread_id, user_id)
  select v_id, u from (
    select p.id as u from profiles p where p_audience = 'CLASS' and p.role = 'student'
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

-- the inbox also makes sure every team the user belongs to (every team, for the teacher) has its chat, so the chat is simply there
drop function if exists msg_inbox();
create or replace function msg_inbox()
returns table (thread_id uuid, subject text, audience text, audience_label text, kind text, last_post_at timestamptz, last_body text, last_sender text, posts bigint, unread boolean) as $$
declare
  v_me uuid := auth.uid(); v_teacher boolean := coalesce(is_teacher(), false); r record;
begin
  if v_me is null then raise exception 'Sign in first.'; end if;
  for r in select m.tenant_id from mfg_teams m
            where v_teacher or exists (select 1 from memberships ms where ms.tenant_id = m.tenant_id and ms.user_id = v_me) loop
    perform msg__team_chat(r.tenant_id, v_me);
  end loop;
  return query
  select t.id, t.subject, t.audience,
         case t.audience when 'CLASS' then 'Whole class' when 'TEAM' then coalesce((select n.name from tenants n where n.id = t.tenant_id), 'Team')
              else coalesce((select p.full_name from profiles p where p.id = t.student_id), 'Student') end,
         t.kind, t.last_post_at,
         coalesce(lp.body, ''), coalesce((select p.full_name from profiles p where p.id = lp.sender_id), ''),
         (select count(*) from msg_posts x where x.thread_id = t.id),
         exists (select 1 from msg_posts x left join msg_members m on m.thread_id = t.id and m.user_id = v_me
                  where x.thread_id = t.id and x.sender_id <> v_me and x.created_at > coalesce(m.last_read_at, '-infinity'::timestamptz))
    from msg_threads t
    left join lateral (select b.body, b.sender_id from msg_posts b where b.thread_id = t.id order by b.created_at desc limit 1) lp on true
   where msg__can(t.id, v_me)
   order by t.last_post_at desc;
end;
$$ language plpgsql security definer set search_path = public;

-- one thread; on a team's thread every post carries the sender's role label
create or replace function msg_thread(p_thread uuid)
returns jsonb as $$
declare
  v_me uuid := auth.uid(); r jsonb;
begin
  if v_me is null or not msg__can(p_thread, v_me) then raise exception 'You can''t open that message.'; end if;
  select jsonb_build_object(
    'id', t.id, 'subject', t.subject, 'audience', t.audience, 'kind', t.kind,
    'audience_label', case t.audience when 'CLASS' then 'Whole class' when 'TEAM' then coalesce((select n.name from tenants n where n.id = t.tenant_id), 'Team')
                       else coalesce((select p.full_name from profiles p where p.id = t.student_id), 'Student') end,
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'sender', coalesce(p.full_name, 'Someone'), 'role', coalesce(p.role, ''),
                              'label', case when t.tenant_id is not null then msg__label(t.tenant_id, x.sender_id) end,
                              'body', x.body, 'at', x.created_at, 'mine', x.sender_id = v_me) order by x.created_at)
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
$$ language sql security definer set search_path = public;

-- the return type of msg_inbox changed (a new column), so the grants are given again
revoke execute on function msg_inbox() from public, anon;
grant execute on function msg_inbox() to authenticated;
revoke execute on function msg_unread_count() from public, anon;
grant execute on function msg_unread_count() to authenticated;
