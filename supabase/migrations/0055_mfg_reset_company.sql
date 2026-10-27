-- ============================================================
-- Classroom ERP — migration 0055 (Manufacturing ERP, Phase 11b: reset a student's company between activities)
--
-- Needs 0017 and 0050–0054. ADDITIVE ONLY: two new functions. No table, policy or trigger is changed.
--
--   Why   A student can own only ONE Manufacturing company, and Activity 1 must start in an empty one. A student who had filled theirs (the demo,
--         earlier practice) would fail the teacher's Check on stray items. Deleting the company worked, but made the student redo the setup wizard.
--   What  mfg_reset_company(p_tenant): teacher only, solo Manufacturing companies only. It remembers the company's owner, name, fiscal year start and
--         costing method, deletes the company with the existing delete_company() (everything in it goes, permanently), and makes a fresh empty one
--         for the same student with the same name and settings, which becomes their current company. Their account is untouched.
--   How   The fresh company is made by a private copy of create_mfg_company() that takes the owner as an argument (the teacher is the caller here),
--         produced from the live function's own text so it can never drift from it.
--
-- ROLLBACK:  drop function if exists mfg_reset_company(uuid), mfg__create_company_for(uuid, text, date, text);
-- ============================================================

do $do$
declare
  d text; n text;
begin
  d := pg_get_functiondef('create_mfg_company(text, date, text)'::regprocedure);
  n := replace(d, 'create_mfg_company(company_name text, fiscal_year_start date, costing_method text)',
                  'mfg__create_company_for(p_owner uuid, company_name text, fiscal_year_start date, costing_method text)');
  n := regexp_replace(n, 'if is_teacher\(\) then raise exception ''Teachers don''''t own companies — students create them\.''; end if;', '', 'g');
  n := replace(n, 'auth.uid()', 'p_owner');
  if n = d or position('is_teacher()' in n) > 0 or position('auth.uid()' in n) > 0 or position('mfg__create_company_for' in n) = 0 then
    raise exception 'create_mfg_company did not look as expected; nothing changed.';
  end if;
  execute n;
end $do$;

revoke execute on function mfg__create_company_for(uuid, text, date, text) from public, anon, authenticated;

create or replace function mfg_reset_company(p_tenant uuid)
returns uuid as $$
declare
  v_owner uuid; v_name text; v_fy date; v_method text; v_new uuid;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can reset a company.'; end if;
  select e.owner_id, t.name, s.fiscal_year_start, s.costing_method into v_owner, v_name, v_fy, v_method
    from tenant_editions e join tenants t on t.id = e.tenant_id join mfg_company_settings s on s.tenant_id = e.tenant_id
   where e.tenant_id = p_tenant and e.edition = 'MANUFACTURING';
  if v_owner is null then raise exception 'Only a student''s own Manufacturing company can be reset (not a team company, and not a Standard company).'; end if;

  perform delete_company(p_tenant);
  v_new := mfg__create_company_for(v_owner, v_name, v_fy, v_method);
  return v_new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function mfg_reset_company(uuid) from public, anon;
grant execute on function mfg_reset_company(uuid) to authenticated;
