-- ============================================================
-- 0092  Announcements per system
--
-- The teacher posts an announcement to one system (Standard, Manufacturing, AIS, BFAR or the BIR Lab); students who may use that system see it at the top of its home page.
-- The teacher's page also drafts a congratulation for the top scorer of each practice set; the teacher edits and posts it (kind TOP_SCORER). Nothing is posted automatically.
--
--   announcements                       RLS on, no policies: nobody reaches it directly; every read and write goes through the functions below.
--   announcement_post(system, title, body, kind, activity)   TEACHER ONLY. Returns the new id.
--   announcement_delete(id)                                   TEACHER ONLY.
--   announcement_list(system)           A student: the newest 30 for that system, only if their account is approved and ticked for it. The teacher: the same, always.
--   announcement_list_all()             TEACHER ONLY. The newest 100 across all systems, for the management list.
--
-- ROLLBACK: drop function announcement_list_all(), announcement_list(text), announcement_delete(uuid), announcement_post(text, text, text, text, text); drop table announcements;
-- ============================================================

create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  system      text not null check (system in ('STANDARD', 'MANUFACTURING', 'AIS', 'BFAR', 'BIR')),
  kind        text not null default 'NOTICE' check (kind in ('NOTICE', 'TOP_SCORER')),
  title       text not null check (length(trim(title)) between 1 and 120),
  body        text not null check (length(trim(body)) between 1 and 2000),
  activity    text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table announcements enable row level security;
create index if not exists announcements_system_idx on announcements (system, created_at desc);

create or replace function announcement_post(p_system text, p_title text, p_body text, p_kind text default 'NOTICE', p_activity text default null)
returns uuid as $$
declare
  new_id uuid;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can post an announcement.'; end if;
  if p_system not in ('STANDARD', 'MANUFACTURING', 'AIS', 'BFAR', 'BIR') then raise exception 'Choose a system.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Give the announcement a title.'; end if;
  if coalesce(trim(p_body), '') = '' then raise exception 'Write the announcement.'; end if;
  insert into announcements (system, kind, title, body, activity, created_by)
  values (p_system, coalesce(p_kind, 'NOTICE'), trim(p_title), trim(p_body), nullif(trim(coalesce(p_activity, '')), ''), auth.uid()) returning id into new_id;
  return new_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function announcement_delete(p_id uuid)
returns void as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can delete an announcement.'; end if;
  delete from announcements where id = p_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function announcement_list(p_system text)
returns jsonb as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if is_teacher() is not true and (access_blocked() or not has_module(lower(p_system))) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'body', x.body, 'kind', x.kind, 'activity', x.activity, 'created_at', x.created_at) order by x.created_at desc)
                     from (select * from announcements a where a.system = upper(p_system) order by a.created_at desc limit 30) x), '[]'::jsonb);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function announcement_list_all()
returns jsonb as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see this.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'system', x.system, 'title', x.title, 'body', x.body, 'kind', x.kind, 'activity', x.activity, 'created_at', x.created_at) order by x.created_at desc)
                     from (select * from announcements a order by a.created_at desc limit 100) x), '[]'::jsonb);
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function announcement_post(text, text, text, text, text) from public, anon;
revoke execute on function announcement_delete(uuid) from public, anon;
revoke execute on function announcement_list(text) from public, anon;
revoke execute on function announcement_list_all() from public, anon;
grant execute on function announcement_post(text, text, text, text, text) to authenticated;
grant execute on function announcement_delete(uuid) to authenticated;
grant execute on function announcement_list(text) to authenticated;
grant execute on function announcement_list_all() to authenticated;
