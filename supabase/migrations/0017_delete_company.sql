-- ============================================================
-- Classroom ERP — upgrade migration 0017
-- Teacher can delete a student company (e.g. to reset the class
-- between practice sets).
--
-- Why this needs more than "delete from tenants":
--   - Every company-owned table already cascades from tenants, but
--     profiles.tenant_id does not, so students are detached first.
--     Their accounts are untouched; on next sign-in they are asked
--     to join or start a company again.
--   - Posted journal entries are immutable (0004), and that trigger
--     also blocks the cascade. It is relaxed for DELETE only, only for
--     a teacher, and only inside delete_company(), which sets a
--     transaction-local flag. Nothing else can set that flag.
--   - Files in the "attachments" storage bucket are not removed here;
--     the teacher page removes them before calling this function.
-- ============================================================

create or replace function block_journal_mutation()
returns trigger as $$
begin
  if tg_op = 'DELETE' and is_teacher() and nullif(current_setting('app.deleting_company', true), '') is not null then
    return old;
  end if;
  raise exception 'Journal entries can''t be edited or deleted once posted — post a reversing entry instead.';
end;
$$ language plpgsql set search_path = public;

create or replace function delete_company(target_tenant uuid)
returns jsonb as $$
declare
  company_name text;
  released int;
begin
  -- is_teacher() is NULL (not false) for a caller with no profile, so test "is not true".
  if is_teacher() is not true then
    raise exception 'Only a teacher can delete a company.';
  end if;

  select name into company_name from tenants where id = target_tenant;
  if not found then
    raise exception 'That company no longer exists.';
  end if;

  update profiles set tenant_id = null where tenant_id = target_tenant;
  get diagnostics released = row_count;

  perform set_config('app.deleting_company', target_tenant::text, true);

  -- Cascades alone are not enough: each cascaded delete is checked on its own, so a
  -- parent (accounts, customers, items...) cannot go before the rows that point at it.
  -- Remove children first, then let the tenants delete cascade the rest.
  delete from bank_transactions where tenant_id = target_tenant;
  delete from journal_entries where tenant_id = target_tenant;
  delete from recurring_entries where tenant_id = target_tenant;
  delete from invoices where tenant_id = target_tenant;
  delete from quotes where tenant_id = target_tenant;
  delete from sales_orders where tenant_id = target_tenant;
  delete from bills where tenant_id = target_tenant;
  delete from purchase_orders where tenant_id = target_tenant;
  delete from payroll_runs where tenant_id = target_tenant;

  delete from tenants where id = target_tenant;

  return jsonb_build_object('name', company_name, 'students_released', released);
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function delete_company(uuid) from public, anon;
grant execute on function delete_company(uuid) to authenticated;
