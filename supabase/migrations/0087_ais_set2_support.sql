-- ============================================================
-- 0087  AIS practice sets: what Set 2 (Pinagpala Hardware, February 2027) needs from the engine
--
--   1. Six control tags the importer would otherwise reject: GHOST_EMPLOYEE, TERMINATED_PAID, IMPLAUSIBLE_HOURS, UNAUTH_OVERTIME, UNAUTH_RATE, CAPEX_ERROR.
--      (They were in the handbook's control list but never in ais_controls. They also become choices in every student's "which control failed" list.)
--   2. The audit population can take its customer names from the set: meta.population.customers (an array of names). A set without it keeps the rice-trading list,
--      so Set 1 is unchanged. Everything else about the population (a sales ledger with duplicates, gaps, round amounts, just-below-limit and weekend entries) is as before.
--
-- ROLLBACK: delete from ais_controls where tag in (the six above); re-run the definition of ais__seed_population from the earlier migration.
-- ============================================================

insert into ais_controls (tag, label, hall_category, description) values
  ('GHOST_EMPLOYEE', 'Pay to a person who is not on the HR master file', 'Master data / existence', 'The payroll register pays someone who has no record on the HR master file.'),
  ('TERMINATED_PAID', 'Pay to an employee who has left', 'Master data / authorization', 'The HR file shows the employee has resigned or been terminated, but payroll still pays them.'),
  ('IMPLAUSIBLE_HOURS', 'Hours claimed are not plausible', 'Accuracy / validity', 'The hours paid are physically implausible or do not match the approved time record.'),
  ('UNAUTH_OVERTIME', 'Overtime paid without an approved overtime slip', 'Transaction authorization', 'The register pays overtime but there is no approved overtime slip.'),
  ('UNAUTH_RATE', 'Pay rate changed without an approved personnel action', 'Master data / authorization', 'The rate paid differs from the HR master rate and no personnel action approves the change.'),
  ('CAPEX_ERROR', 'Capital and expense misclassified', 'Classification', 'A repair or running cost is booked as a fixed asset, or an asset is booked as an expense.')
on conflict (tag) do nothing;

do $do$
declare
  d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ais__seed_population';
  if d is null then raise exception 'ais__seed_population was not found'; end if;
  n := replace(d, 'sd := inst.seed;',
    'sd := inst.seed; if jsonb_typeof(p_spec -> ''customers'') = ''array'' and jsonb_array_length(p_spec -> ''customers'') > 0 then customers := array(select jsonb_array_elements_text(p_spec -> ''customers'')); end if;');
  if n = d then raise exception 'ais__seed_population did not contain the expected text; nothing changed'; end if;
  execute n;
end
$do$;
