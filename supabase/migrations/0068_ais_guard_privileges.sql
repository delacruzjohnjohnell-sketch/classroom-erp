-- ============================================================
-- Classroom ERP — migration 0068 (AIS edition: close the trigger functions to the API)
--
-- The three AIS guard functions are trigger functions; nobody should be able to call them over /rest/v1/rpc. A trigger runs the function without
-- the firing user needing EXECUTE (that right is checked when the trigger is created), so revoking it does not stop the guards.
--
-- ROLLBACK: grant execute on function guard_ais_membership(), guard_ais_ledger_insert(), guard_ais_lock_date() to public;
-- ============================================================
revoke execute on function guard_ais_membership() from public, anon, authenticated;
revoke execute on function guard_ais_ledger_insert() from public, anon, authenticated;
revoke execute on function guard_ais_lock_date() from public, anon, authenticated;
