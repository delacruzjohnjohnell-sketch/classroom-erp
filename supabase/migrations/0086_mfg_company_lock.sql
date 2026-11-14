-- ============================================================
-- 0086  Manufacturing: the teacher marks a company "checked", which locks it for its students
--
-- Once a teacher has checked a practice set and released the answer key, the student must not change the company any more.
--   mfg_company_settings.checked_at / checked_by   set when the teacher marks the company checked, cleared when the teacher marks it unchecked.
--   mfg__lock_trg()                                one guard on every business table that carries a tenant_id (and on the eight line tables, through their parent):
--                                                  a student (any signed-in user who is not the teacher) can't insert, update or delete in a checked company.
--                                                  It fires for the writes done inside the security-definer functions too, so no screen needs its own check.
--                                                  The teacher, and the database owner (no signed-in user), are never blocked.
--   mfg_company_set_checked(tenant, checked, activity)   teacher only. Checking also releases the answer key for that activity to the company's student(s).
--                                                  Unchecking only unlocks; the answer key has its own take-back switch.
--   mfg_company_checked(tenant)                    the time the company was checked, or null; the teacher and the company's own members may read it.
--
-- Left out of the guard on purpose: profiles, memberships, tenant_editions, edition_last_used, doc_counters, msg_threads, practice_reports, mfg_activity_keys,
--   mfg_company_roles, mfg_teams, mfg_audit_log (who the person is, what they have opened, the team's setup and the logs are not the company's books).
--
-- ROLLBACK: drop every trigger named mfg_lock_trg (one per table, created in the loop below), drop function mfg__lock_trg(), mfg_company_set_checked(uuid, boolean, text),
--           mfg_company_checked(uuid), mfg__is_locked(uuid); alter table mfg_company_settings drop column checked_at, drop column checked_by.
-- ============================================================

alter table mfg_company_settings add column if not exists checked_at timestamptz;
alter table mfg_company_settings add column if not exists checked_by uuid references auth.users(id) on delete set null;

create or replace function mfg__is_locked(p_tenant uuid)
returns boolean as $$
  select exists (select 1 from mfg_company_settings where tenant_id = p_tenant and checked_at is not null);
$$ language sql stable security definer set search_path = public;
revoke execute on function mfg__is_locked(uuid) from public, anon, authenticated;

-- trigger arguments: none for a table with its own tenant_id; (parent table, foreign key column) for a line table
create or replace function mfg__lock_trg()
returns trigger as $$
declare
  j jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  t uuid;
begin
  if auth.uid() is null or is_teacher() then
    return coalesce(new, old);
  end if;
  if tg_nargs = 2 then
    execute format('select tenant_id from %I where id = $1', tg_argv[0]) into t using (j ->> tg_argv[1])::uuid;
  else
    t := (j ->> 'tenant_id')::uuid;
  end if;
  if t is not null and mfg__is_locked(t) then
    raise exception 'Your teacher has checked this company, so it is locked. You can look at everything but not change it. Ask your teacher if something needs correcting.';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql stable security definer set search_path = public;
revoke execute on function mfg__lock_trg() from public, anon, authenticated;

do $do$
declare
  r record;
  skip text[] := array['profiles', 'memberships', 'tenant_editions', 'edition_last_used', 'doc_counters', 'msg_threads', 'practice_reports',
                       'mfg_activity_keys', 'mfg_company_roles', 'mfg_teams', 'mfg_audit_log'];
  lines text[][] := array[
    ['bill_lines', 'bills', 'bill_id'], ['goods_receipt_lines', 'goods_receipts', 'goods_receipt_id'], ['invoice_lines', 'invoices', 'invoice_id'],
    ['journal_lines', 'journal_entries', 'journal_entry_id'], ['purchase_order_lines', 'purchase_orders', 'purchase_order_id'], ['quote_lines', 'quotes', 'quote_id'],
    ['recurring_entry_lines', 'recurring_entries', 'recurring_entry_id'], ['sales_order_lines', 'sales_orders', 'sales_order_id']];
  i int;
begin
  for r in
    select c.table_name from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and c.column_name = 'tenant_id' and t.table_type = 'BASE TABLE'
       and c.table_name not like 'ais\_%' and c.table_name not like 'bir\_%' and c.table_name not like 'bfar\_%' and c.table_name <> all (skip)
  loop
    execute format('drop trigger if exists mfg_lock_trg on %I', r.table_name);
    execute format('create trigger mfg_lock_trg before insert or update or delete on %I for each row execute function mfg__lock_trg()', r.table_name);
  end loop;
  for i in 1 .. array_length(lines, 1) loop
    execute format('drop trigger if exists mfg_lock_trg on %I', lines[i][1]);
    execute format('create trigger mfg_lock_trg before insert or update or delete on %I for each row execute function mfg__lock_trg(%L, %L)', lines[i][1], lines[i][2], lines[i][3]);
  end loop;
end
$do$;

create or replace function mfg_company_checked(p_tenant uuid)
returns timestamptz as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not (is_teacher() or exists (select 1 from memberships where tenant_id = p_tenant and user_id = auth.uid())) then
    raise exception 'That is not your company.';
  end if;
  return (select checked_at from mfg_company_settings where tenant_id = p_tenant);
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_company_set_checked(p_tenant uuid, p_checked boolean, p_activity text default null)
returns timestamptz as $$
declare
  at timestamptz;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can mark a company checked.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if not exists (select 1 from mfg_company_settings where tenant_id = p_tenant) then raise exception 'That company has no Manufacturing settings.'; end if;
  update mfg_company_settings
     set checked_at = case when p_checked then now() end, checked_by = case when p_checked then auth.uid() end
   where tenant_id = p_tenant
   returning checked_at into at;
  if p_checked and p_activity is not null and exists (select 1 from mfg__release_users(p_tenant)) then
    perform mfg_activity_release_company(p_activity, p_tenant, true);
  end if;
  return at;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function mfg_company_checked(uuid) from public, anon;
revoke execute on function mfg_company_set_checked(uuid, boolean, text) from public, anon;
grant execute on function mfg_company_checked(uuid) to authenticated;
grant execute on function mfg_company_set_checked(uuid, boolean, text) to authenticated;
