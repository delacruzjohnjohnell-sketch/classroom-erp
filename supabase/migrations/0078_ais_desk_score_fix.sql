-- ============================================================
-- Classroom ERP — migration 0078 (AIS edition: a trap card nobody worked must not score)
--
-- Needs 0076 and 0077. Edits two of our own functions in place (pg_get_functiondef + replace), so the rest of each function is exactly what was installed.
--
-- Found on the first look at the live Purchases desk: ais_wb_my_score and ais_pw_my_score gave 6 points to a trap card the student never opened ("not processed, so
-- it was not released"). A student who did nothing scored 24 of 54 on the Sales desk and 30 of 54 on the Purchases desk. Stopping a bad item means looking at it
-- and rejecting it, so a trap card with no order or invoice now scores 0. A trap the student rejected still scores 6.
--
-- ROLLBACK: re-run ais_wb_my_score from 0076 and ais_pw_my_score from 0077.
-- ============================================================

do $do$
declare
  d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'ais_wb_my_score' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'ais_wb_my_score was not found'; end if;
  if position('You did not work this card' in d) = 0 then
    n := replace(d, 'if o.id is null or o.status = ''REJECTED'' then p := 6; msg := case when o.id is null then ''Not processed, so it was not released.'' else ''Correct: you stopped it.'' end;',
                    'if o.id is null then p := 0; msg := ''You did not work this card. Stopping a bad order means looking at it and rejecting it.''; elsif o.status = ''REJECTED'' then p := 6; msg := ''Correct: you stopped it.'';');
    if n = d then raise exception 'ais_wb_my_score: the text to change was not found'; end if;
    execute n;
  end if;

  select pg_get_functiondef(p.oid) into d from pg_proc p where p.proname = 'ais_pw_my_score' and p.pronamespace = 'public'::regnamespace;
  if d is null then raise exception 'ais_pw_my_score was not found'; end if;
  if position('You did not work this card' in d) = 0 then
    n := replace(d, 'if b.id is null or b.status = ''REJECTED'' then p := 6; msg := case when b.id is null then ''Not processed, so nothing was paid.'' else ''Correct: you stopped it.'' end;',
                    'if b.id is null then p := 0; msg := ''You did not work this card. Stopping a bad invoice means looking at it and rejecting it.''; elsif b.status = ''REJECTED'' then p := 6; msg := ''Correct: you stopped it.'';');
    if n = d then raise exception 'ais_pw_my_score: the text to change was not found'; end if;
    execute n;
  end if;
end $do$;
