-- ============================================================
-- Classroom ERP — migration 0058 (a student may own several Manufacturing companies)
--
-- Needs 0055. Until now a unique index (tenant_editions_one_mfg_per_owner) and a guard inside create_mfg_company() allowed ONE Manufacturing company per
-- student. Practice sets need a fresh company each (Activity 1 stays untouched while Activity 2 starts), so the rule becomes a limit of FIVE.
--
--   - The unique index is dropped.
--   - create_mfg_company() keeps its own text, except the "you already have one" guard becomes "you already have five".
--   - mfg__create_company_for() (the private copy the teacher's Reset uses) is rebuilt from the new text, so Reset keeps working for a student who owns
--     several companies.
--   - The teacher can still delete or reset any company; a deleted company frees a place.
--
-- ROLLBACK: create unique index tenant_editions_one_mfg_per_owner on tenant_editions (owner_id) where edition = 'MANUFACTURING'; (only works while nobody owns two),
--           then re-run the definition of create_mfg_company in the migration that last defined it, and 0055's function copy.
-- ============================================================

drop index if exists tenant_editions_one_mfg_per_owner;

do $do$
declare
  d text; n text; guard text;
begin
  d := pg_get_functiondef('create_mfg_company(text, date, text)'::regprocedure);
  guard := 'if exists (select 1 from tenant_editions where owner_id = auth.uid() and edition = ''MANUFACTURING'') then
    raise exception ''You already have a Manufacturing company.'';
  end if;';
  if position(guard in d) = 0 then raise exception 'create_mfg_company did not look as expected; nothing changed.'; end if;
  n := replace(d, guard, 'if (select count(*) from tenant_editions where owner_id = auth.uid() and edition = ''MANUFACTURING'') >= 5 then
    raise exception ''You already have five Manufacturing companies, the most you can have. Ask your teacher to delete one you no longer need.'';
  end if;');
  execute n;

  -- the private copy used by the teacher's Reset: same text, owner passed in
  d := pg_get_functiondef('create_mfg_company(text, date, text)'::regprocedure);
  n := replace(d, 'create_mfg_company(company_name text, fiscal_year_start date, costing_method text)',
                  'mfg__create_company_for(p_owner uuid, company_name text, fiscal_year_start date, costing_method text)');
  n := regexp_replace(n, 'if is_teacher\(\) then raise exception ''Teachers don''''t own companies — students create them\.''; end if;', '', 'g');
  n := replace(n, 'auth.uid()', 'p_owner');
  if n = d or position('is_teacher()' in n) > 0 or position('auth.uid()' in n) > 0 or position('mfg__create_company_for' in n) = 0 then
    raise exception 'the company copy did not look as expected; nothing changed.';
  end if;
  execute n;
end $do$;

revoke execute on function mfg__create_company_for(uuid, text, date, text) from public, anon, authenticated;
