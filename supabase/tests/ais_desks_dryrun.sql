-- ============================================================
-- AIS desks: rolled-back test scripts (migrations 0076 to 0082)
--
-- How to use: run ONE block at a time (the SQL editor, or the execute_sql tool). Each block works the desk as a test student, then ends by raising an
-- exception that starts with "DRYRUN:" and carries the results, so nothing is ever saved. A block that finishes with any other error has found a bug.
--
-- Before you run a block, replace the ids in its declare section:
--   u = the user id of a test STUDENT who holds the Accounting seat in an AIS company
--   t = that AIS company's id, which must have a practice set assigned, the Accounting phase open, and fresh desks (never opened, or reset)
-- The teacher id (tch) is used only by block 6.
--
-- What each block expects is written in the comment above it. These are the same checks used to prove each migration before it was applied.
-- ============================================================

-- ---------- 1. Sales desk (0076, 0077 fix, 0078). Expect: 12 new entries, imbalance 0, errors listed for the hard controls, planted [CREDIT_LIMIT,DUP_INVOICE], score 42 ----------
do $dry$
declare
  u uuid := '00000000-0000-0000-0000-000000000000'; t uuid := '00000000-0000-0000-0000-000000000000';
  s jsonb; tk jsonb[]; o1 uuid; o2 uuid; o3 uuid; o4 uuid; o5 uuid; o6 uuid; o7 uuid; errs text[] := array[]::text[]; sc jsonb; planted text; tb numeric; n0 int; n1 int;
begin
  select count(*) into n0 from journal_entries where tenant_id = t;
  update profiles set tenant_id = t where id = u;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  s := ais_wb_state(); tk := array(select x from jsonb_array_elements(s -> 'tasks') x order by (x ->> 'seq')::int);
  o1 := ais_wb_enter_order((tk[1] ->> 'id')::uuid, (tk[1] ->> 'customer_id')::uuid, (tk[1] ->> 'item_id')::uuid, 40, 2050);
  begin perform ais_wb_ship(o1); exception when others then errs := errs || ('ship-before-check: ' || sqlerrm); end;
  perform ais_wb_credit_check(o1); perform ais_wb_ship(o1);
  begin perform ais_wb_receive((tk[8] ->> 'id')::uuid, o1, 91840); exception when others then errs := errs || ('receive-before-bill: ' || sqlerrm); end;
  perform ais_wb_bill(o1);
  o2 := ais_wb_enter_order((tk[2] ->> 'id')::uuid, (tk[2] ->> 'customer_id')::uuid, (tk[2] ->> 'item_id')::uuid, 30, 1850); perform ais_wb_credit_check(o2); perform ais_wb_ship(o2); perform ais_wb_bill(o2);
  o3 := ais_wb_enter_order((tk[3] ->> 'id')::uuid, (tk[3] ->> 'customer_id')::uuid, (tk[3] ->> 'item_id')::uuid, 50, 2050); perform ais_wb_credit_check(o3);
  begin perform ais_wb_ship(o3); exception when others then errs := errs || ('ship-held: ' || sqlerrm); end;
  begin perform ais_wb_approve(o3, 'short'); exception when others then errs := errs || ('approve-short: ' || sqlerrm); end;
  perform ais_wb_approve(o3, 'Customer asked us to rush it, I approve the credit.'); perform ais_wb_ship(o3); perform ais_wb_bill(o3);
  o4 := ais_wb_enter_order((tk[4] ->> 'id')::uuid, (tk[4] ->> 'customer_id')::uuid, (tk[4] ->> 'item_id')::uuid, 25, 2100); perform ais_wb_credit_check(o4); perform ais_wb_reject(o4, 'Price is below the approved price list; no discount authorized.');
  o5 := ais_wb_enter_order((tk[5] ->> 'id')::uuid, (tk[5] ->> 'customer_id')::uuid, (tk[5] ->> 'item_id')::uuid, 20, 2050); perform ais_wb_credit_check(o5); perform ais_wb_ship(o5); perform ais_wb_bill(o5);
  o6 := ais_wb_enter_order((tk[6] ->> 'id')::uuid, (tk[6] ->> 'customer_id')::uuid, (tk[6] ->> 'item_id')::uuid, 10, 1850); perform ais_wb_credit_check(o6); perform ais_wb_reject(o6, 'Customer already owes 45,920; this passes the limit.');
  o7 := ais_wb_enter_order((tk[7] ->> 'id')::uuid, (tk[7] ->> 'customer_id')::uuid, (tk[7] ->> 'item_id')::uuid, 40, 2050); perform ais_wb_credit_check(o7); perform ais_wb_ship(o7); perform ais_wb_bill(o7);
  begin perform ais_wb_receive((tk[8] ->> 'id')::uuid, o1, 50000); exception when others then errs := errs || ('wrong-amount: ' || sqlerrm); end;
  perform ais_wb_receive((tk[8] ->> 'id')::uuid, o1, 91840); perform ais_wb_receive((tk[9] ->> 'id')::uuid, o2, 30125.50);
  sc := ais_wb_my_score();
  reset role;
  select count(*) into n1 from journal_entries where tenant_id = t;
  select coalesce(sum(l.debit) - sum(l.credit), 0) into tb from journal_lines l join journal_entries j on j.id = l.journal_entry_id where j.tenant_id = t and j.source_table like 'ais_wb_%';
  select string_agg(type, ',' order by type) into planted from ais_planted where tenant_id = t and detail ->> 'source' = 'workbench';
  raise exception 'DRYRUN: new entries %, imbalance %, planted [%], errors %, score % of %', n1 - n0, tb, planted, errs, sc -> 'points', sc -> 'max';
end $dry$;

-- ---------- 2. Purchases desk (0077). Expect: 12 new entries, imbalance 0, 5900 variance 14000, planted [DUP_INVOICE,PRICE_MISMATCH,UNAPPROVED_VENDOR], score 36 ----------
do $dry$
declare
  u uuid := '00000000-0000-0000-0000-000000000000'; t uuid := '00000000-0000-0000-0000-000000000000';
  s jsonb; tk jsonb[]; b1 uuid; b2 uuid; b3 uuid; b4 uuid; b5 uuid; b6 uuid; b7 uuid; errs text[] := array[]::text[]; sc jsonb; planted text; tb numeric; n0 int; n1 int; var3 numeric;
begin
  select count(*) into n0 from journal_entries where tenant_id = t;
  update profiles set tenant_id = t where id = u;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  s := ais_pw_state(); tk := array(select x from jsonb_array_elements(s -> 'tasks') x order by (x ->> 'seq')::int);
  begin perform ais_pw_receive((tk[5] ->> 'id')::uuid, 80); exception when others then errs := errs || ('receive-no-rr: ' || sqlerrm); end;
  begin perform ais_pw_receive((tk[1] ->> 'id')::uuid, 150); exception when others then errs := errs || ('receive-wrong-qty: ' || sqlerrm); end;
  perform ais_pw_receive((tk[1] ->> 'id')::uuid, 200);
  begin perform ais_pw_enter_invoice((tk[1] ->> 'id')::uuid, 'V-5521', 200, 1700); exception when others then errs := errs || ('invoice-wrong-price: ' || sqlerrm); end;
  b1 := ais_pw_enter_invoice((tk[1] ->> 'id')::uuid, 'V-5521', 200, 1640);
  begin perform ais_pw_post(b1); exception when others then errs := errs || ('post-before-match: ' || sqlerrm); end;
  perform ais_pw_match(b1); perform ais_pw_post(b1);
  perform ais_pw_receive((tk[2] ->> 'id')::uuid, 300); b2 := ais_pw_enter_invoice((tk[2] ->> 'id')::uuid, 'V-2207', 300, 1480); perform ais_pw_match(b2); perform ais_pw_post(b2);
  perform ais_pw_receive((tk[3] ->> 'id')::uuid, 100); b3 := ais_pw_enter_invoice((tk[3] ->> 'id')::uuid, 'V-5530', 100, 1980); perform ais_pw_match(b3);
  begin perform ais_pw_post(b3); exception when others then errs := errs || ('post-held: ' || sqlerrm); end;
  perform ais_pw_approve(b3, 'Vendor insists on the new price.'); perform ais_pw_post(b3);
  perform ais_pw_receive((tk[4] ->> 'id')::uuid, 120); b4 := ais_pw_enter_invoice((tk[4] ->> 'id')::uuid, 'V-2214', 150, 1480); perform ais_pw_match(b4); perform ais_pw_reject(b4, 'Billed 150 but only 120 sacks were received.');
  b5 := ais_pw_enter_invoice((tk[5] ->> 'id')::uuid, 'V-0091', 80, 1640); perform ais_pw_match(b5); perform ais_pw_reject(b5, 'No receiving report on file for this invoice.');
  b6 := ais_pw_enter_invoice((tk[6] ->> 'id')::uuid, 'V-0310', 60, 1500); perform ais_pw_match(b6); perform ais_pw_approve(b6, 'Good price, buying from them anyway.'); perform ais_pw_post(b6);
  perform ais_pw_receive((tk[7] ->> 'id')::uuid, 200); b7 := ais_pw_enter_invoice((tk[7] ->> 'id')::uuid, 'V-5521', 200, 1640); perform ais_pw_match(b7); perform ais_pw_post(b7);
  begin perform ais_pw_pay((tk[8] ->> 'id')::uuid, b1, 100000); exception when others then errs := errs || ('pay-wrong-amount: ' || sqlerrm); end;
  perform ais_pw_pay((tk[8] ->> 'id')::uuid, b1, 367360); perform ais_pw_pay((tk[9] ->> 'id')::uuid, b2, 497280);
  sc := ais_pw_my_score();
  reset role;
  select count(*) into n1 from journal_entries where tenant_id = t;
  select coalesce(sum(l.debit) - sum(l.credit), 0) into tb from journal_lines l join journal_entries j on j.id = l.journal_entry_id where j.tenant_id = t and j.source_table like 'ais_pw_%';
  select string_agg(type, ',' order by type) into planted from ais_planted where tenant_id = t and detail ->> 'source' = 'purchases';
  select coalesce(sum(l.debit - l.credit), 0) into var3 from journal_lines l join accounts a on a.id = l.account_id join journal_entries j on j.id = l.journal_entry_id where j.tenant_id = t and a.code = '5900' and j.source_table like 'ais_pw_%';
  raise exception 'DRYRUN: new entries %, imbalance %, 5900 variance %, planted [%], errors %, score % of %', n1 - n0, tb, var3, planted, errs, sc -> 'points', sc -> 'max';
end $dry$;

-- ---------- 3. Payroll desk (0079). Expect: 7 new entries, imbalance 0, planted [TERMINATED_PAID,UNAUTH_OVERTIME,UNAUTH_RATE], score 42 of 60 ----------
do $dry$
declare
  u uuid := '00000000-0000-0000-0000-000000000000'; t uuid := '00000000-0000-0000-0000-000000000000';
  s jsonb; tk jsonb[]; errs text[] := array[]::text[]; sc jsonb; planted text; tb numeric; n0 int; n1 int; vouchers int; paid numeric;
begin
  select count(*) into n0 from journal_entries where tenant_id = t;
  update profiles set tenant_id = t where id = u;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  s := ais_pr_state(); tk := array(select x from jsonb_array_elements(s -> 'tasks') x order by (x ->> 'seq')::int);
  begin perform ais_pr_post(); exception when others then errs := errs || ('post-early: ' || sqlerrm); end;
  begin perform ais_pr_pay(); exception when others then errs := errs || ('pay-early: ' || sqlerrm); end;
  perform ais_pr_check((tk[1] ->> 'id')::uuid); perform ais_pr_check((tk[2] ->> 'id')::uuid); perform ais_pr_check((tk[3] ->> 'id')::uuid);
  begin perform ais_pr_check((tk[1] ->> 'id')::uuid); exception when others then errs := errs || ('check-twice: ' || sqlerrm); end;
  perform ais_pr_check((tk[4] ->> 'id')::uuid);
  begin perform ais_pr_approve((tk[1] ->> 'id')::uuid, 'Trying to approve a clean card.'); exception when others then errs := errs || ('approve-clean: ' || sqlerrm); end;
  perform ais_pr_approve((tk[4] ->> 'id')::uuid, 'The supervisor said it was fine.');
  perform ais_pr_check((tk[5] ->> 'id')::uuid); perform ais_pr_approve((tk[5] ->> 'id')::uuid, 'Department head asked for the raise.');
  perform ais_pr_check((tk[6] ->> 'id')::uuid);
  perform ais_pr_check((tk[7] ->> 'id')::uuid); perform ais_pr_reject((tk[7] ->> 'id')::uuid, 'No HR file exists for this person.');
  perform ais_pr_check((tk[8] ->> 'id')::uuid); perform ais_pr_approve((tk[8] ->> 'id')::uuid, 'The supervisor insists he worked it.');
  begin perform ais_pr_post(); exception when others then errs := errs || ('post-undecided: ' || sqlerrm); end;
  perform ais_pr_check((tk[9] ->> 'id')::uuid); perform ais_pr_reject((tk[9] ->> 'id')::uuid, 'Hours are not possible; ask the supervisor.');
  vouchers := ais_pr_post(); paid := ais_pr_pay();
  begin perform ais_pr_pay(); exception when others then errs := errs || ('pay-twice: ' || sqlerrm); end;
  sc := ais_pr_my_score();
  reset role;
  select count(*) into n1 from journal_entries where tenant_id = t;
  select coalesce(sum(l.debit) - sum(l.credit), 0) into tb from journal_lines l join journal_entries j on j.id = l.journal_entry_id where j.tenant_id = t and j.source_table = 'ais_pr_tasks';
  select string_agg(type, ',' order by type) into planted from ais_planted where tenant_id = t and detail ->> 'source' = 'payroll';
  raise exception 'DRYRUN: new entries %, vouchers %, net paid %, imbalance %, planted [%], errors %, score % of %', n1 - n0, vouchers, paid, tb, planted, errs, sc -> 'points', sc -> 'max';
end $dry$;

-- ---------- 4. Fixed assets desk (0080). Expect: 8 new entries (incl. the opening entry), imbalance 0, depreciation 33975, gain 18000, planted [CAPEX_ERROR] (card 4 capitalized on purpose), score 36 of 42 ----------
do $dry$
declare
  u uuid := '00000000-0000-0000-0000-000000000000'; t uuid := '00000000-0000-0000-0000-000000000000';
  s jsonb; tk jsonb[]; errs text[] := array[]::text[]; sc jsonb; planted text; tb numeric; n0 int; n1 int; dep numeric; gain numeric;
begin
  select count(*) into n0 from journal_entries where tenant_id = t;
  update profiles set tenant_id = t where id = u;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  s := ais_fa_state(); tk := array(select x from jsonb_array_elements(s -> 'tasks') x order by (x ->> 'seq')::int);
  begin perform ais_fa_depreciate(); exception when others then errs := errs || ('dep-early: ' || sqlerrm); end;
  begin perform ais_fa_dispose((tk[7] ->> 'id')::uuid); exception when others then errs := errs || ('sale-early: ' || sqlerrm); end;
  perform ais_fa_decide((tk[1] ->> 'id')::uuid, 'CAPITALIZE');
  begin perform ais_fa_decide((tk[1] ->> 'id')::uuid, 'EXPENSE'); exception when others then errs := errs || ('decide-twice: ' || sqlerrm); end;
  begin perform ais_fa_decide((tk[2] ->> 'id')::uuid, 'MAYBE'); exception when others then errs := errs || ('bad-choice: ' || sqlerrm); end;
  perform ais_fa_decide((tk[2] ->> 'id')::uuid, 'CAPITALIZE'); perform ais_fa_decide((tk[3] ->> 'id')::uuid, 'EXPENSE');
  perform ais_fa_decide((tk[4] ->> 'id')::uuid, 'CAPITALIZE'); perform ais_fa_decide((tk[5] ->> 'id')::uuid, 'CAPITALIZE');
  dep := ais_fa_depreciate(); gain := ais_fa_dispose((tk[7] ->> 'id')::uuid);
  sc := ais_fa_my_score();
  reset role;
  select count(*) into n1 from journal_entries where tenant_id = t;
  select coalesce(sum(l.debit) - sum(l.credit), 0) into tb from journal_lines l join journal_entries j on j.id = l.journal_entry_id where j.tenant_id = t and j.source_table in ('ais_fa_tasks', 'ais_fa_assets');
  select string_agg(type, ',' order by type) into planted from ais_planted where tenant_id = t and detail ->> 'source' = 'assets';
  raise exception 'DRYRUN: new entries %, imbalance %, depreciation %, gain %, planted [%], errors %, score % of %', n1 - n0, tb, dep, gain, planted, errs, sc -> 'points', sc -> 'max';
end $dry$;

-- ---------- 5. Close and statements (0081). Expect: 3 new entries, trial balance and balance sheet balance before and after closing, skipping the accrual plants CUTOFF, score 18 of 18 ----------
do $dry$
declare
  u uuid := '00000000-0000-0000-0000-000000000000'; t uuid := '00000000-0000-0000-0000-000000000000';
  s0 jsonb; s1 jsonb; s2 jsonb; ar numeric; errs text[] := array[]::text[]; sc jsonb; skipmsg text; n0 int; n1 int; ni numeric;
begin
  select count(*) into n0 from journal_entries where tenant_id = t;
  update profiles set tenant_id = t where id = u;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  s0 := ais_cl_state(); ar := (s0 ->> 'receivable')::numeric;
  begin perform ais_cl_close(); exception when others then errs := errs || ('close-early: ' || sqlerrm); end;
  begin perform ais_cl_allowance(ar * 0.05); exception when others then errs := errs || ('wrong-allowance: ' || sqlerrm); end;
  perform ais_cl_allowance(round(ar * 0.02, 2));
  begin perform ais_cl_allowance(round(ar * 0.02, 2)); exception when others then errs := errs || ('allowance-twice: ' || sqlerrm); end;
  begin
    perform ais_cl_accrue('SKIP'); reset role;
    select 'planted CUTOFF rows: ' || count(*) into skipmsg from ais_planted where tenant_id = t and type = 'CUTOFF' and detail ->> 'source' = 'close';
    raise exception 'SKIPCHK';
  exception when others then if sqlerrm <> 'SKIPCHK' then raise; end if; end;
  perform ais_cl_accrue('ACCRUE');
  s1 := ais_cl_state() -> 'statements'; ni := ais_cl_close(); s2 := ais_cl_state() -> 'statements'; sc := ais_cl_my_score();
  reset role;
  select count(*) into n1 from journal_entries where tenant_id = t;
  raise exception 'DRYRUN: new entries %, before close TB ok % BS balanced %, after close closed % TB ok % BS balanced % earnings line %, skip path %, errors %, score % of %',
    n1 - n0, s1 ->> 'tb_ok', s1 -> 'balance' ->> 'balanced', s2 ->> 'closed', s2 ->> 'tb_ok', s2 -> 'balance' ->> 'balanced', s2 -> 'balance' ->> 'current_earnings', skipmsg, errs, sc -> 'points', sc -> 'max';
end $dry$;

-- ---------- 6. Teacher scores, desk reset, process score (0082). Run on a company with fresh desks.
--            Expect: student and teacher scores match for every desk, the student is refused both teacher functions, reset leaves no desk entries or planted rows ----------
do $dry$
declare
  u uuid := '00000000-0000-0000-0000-000000000000'; tch uuid := '00000000-0000-0000-0000-000000000000'; t uuid := '00000000-0000-0000-0000-000000000000';
  s jsonb; tk jsonb[]; o uuid; errs text[] := array[]::text[]; stu numeric[]; rs jsonb; n_desk1 int; planted_left int; same boolean := true; v numeric; proc jsonb;
  ar text[] := array['SALES', 'PURCHASES', 'PAYROLL', 'ASSETS', 'CLOSE'];
begin
  update profiles set tenant_id = t where id = u;
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  s := ais_wb_state(); tk := array(select x from jsonb_array_elements(s -> 'tasks') x order by (x ->> 'seq')::int);
  o := ais_wb_enter_order((tk[1] ->> 'id')::uuid, (tk[1] ->> 'customer_id')::uuid, (tk[1] ->> 'item_id')::uuid, 40, 2050); perform ais_wb_credit_check(o); perform ais_wb_ship(o); perform ais_wb_bill(o);
  s := ais_pw_state(); tk := array(select x from jsonb_array_elements(s -> 'tasks') x order by (x ->> 'seq')::int); perform ais_pw_receive((tk[1] ->> 'id')::uuid, 200);
  s := ais_pr_state(); tk := array(select x from jsonb_array_elements(s -> 'tasks') x order by (x ->> 'seq')::int); perform ais_pr_check((tk[1] ->> 'id')::uuid);
  s := ais_fa_state(); tk := array(select x from jsonb_array_elements(s -> 'tasks') x order by (x ->> 'seq')::int); perform ais_fa_decide((tk[4] ->> 'id')::uuid, 'CAPITALIZE');
  s := ais_cl_state();
  stu := array[(ais_wb_my_score() ->> 'points')::numeric, (ais_pw_my_score() ->> 'points')::numeric, (ais_pr_my_score() ->> 'points')::numeric, (ais_fa_my_score() ->> 'points')::numeric, (ais_cl_my_score() ->> 'points')::numeric];
  begin perform ais_reset_desks(t); exception when others then errs := errs || ('student-reset: ' || sqlerrm); end;
  begin perform * from ais_class_score_items(); exception when others then errs := errs || ('student-class-items: ' || sqlerrm); end;
  reset role;
  perform set_config('request.jwt.claim.sub', tch::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', tch, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1..5 loop
    select coalesce(sum(c.points), 0) into v from ais_class_score_items() c where c.tenant_id = t and c.area = ar[i];
    if v <> stu[i] then same := false; end if;
  end loop;
  rs := ais_reset_desks(t);
  reset role;
  select count(*) into n_desk1 from journal_entries where tenant_id = t and source_table in ('ais_wb_orders', 'ais_wb_receipts', 'ais_pw_receipts', 'ais_pw_bills', 'ais_pr_tasks', 'ais_fa_tasks', 'ais_fa_assets', 'ais_cl_tasks');
  select count(*) into planted_left from ais_planted where tenant_id = t and detail ->> 'source' in ('workbench', 'purchases', 'payroll', 'assets', 'close');
  proc := ais__audit_process(t);
  raise exception 'DRYRUN: student scores equal the teacher list: %, reset removed %, desk entries left %, desk planted left %, process score now % of % (0 of 10 on an untouched audit), errors %',
    same, rs, n_desk1, planted_left, proc ->> 'points', proc ->> 'max', errs;
end $dry$;
