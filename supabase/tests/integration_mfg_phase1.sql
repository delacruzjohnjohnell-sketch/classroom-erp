-- ============================================================
-- Manufacturing ERP — Phase 1 integration test (migrations 0023 + 0024).
-- Run AFTER the two migrations (or paste it after them in one script). It ends with a
-- RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Any line starting with FAIL is a problem.
--
-- Set s1/t1 to a student and their Standard company, s2/t2 to a second student in a
-- DIFFERENT company, teach to the teacher's profile id. The Z-lines compare a fingerprint
-- of every pre-existing function, column, policy and trigger with the fingerprint taken
-- before the migrations ran — they must all read true (nothing existing was changed).
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  t1 uuid := '486537ec-789f-4bba-8fe2-e44c6be2e859';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  t2 uuid := '1386cbcc-ac13-4f8b-8bc4-ee4b1edf060e';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := '';
  mfg uuid; c int; c0 int; n numeric; st text; d date;
  cust uuid; inv uuid; emp uuid; fa uuid; rec uuid; a_opex uuid; a_cash uuid; je uuid;
  new_fns text[] := array['tenant_edition','assert_mfg_tenant','set_edition_enabled','guard_mfg_membership','update_mfg_settings','set_mfg_costing_method','record_edition_open','mfg_account','create_mfg_company'];
  new_tabs text[] := array['tenant_editions','edition_settings','mfg_company_settings','mfg_audit_log','edition_last_used','mfg_account_determination'];
  h text;
begin
  ---------------------------------------------------------------- Z. nothing that existed was changed
  select md5(string_agg(md5(pg_get_functiondef(p.oid)), '' order by p.oid::regprocedure::text)) into h
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname <> all(new_fns);
  res := res || 'Z1 existing functions unchanged=' || (h = '9601cb632ec61fcdeba1458704903549') || E'\n';
  select md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), ',' order by table_name, column_name)) into h
    from information_schema.columns where table_schema = 'public' and table_name <> all(new_tabs);
  res := res || 'Z2 existing columns unchanged=' || (h = 'a1dcae4be9595f288570e8a7cd48d52a') || E'\n';
  select md5(string_agg(tablename||'.'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by tablename, policyname)) into h
    from pg_policies where schemaname = 'public' and tablename <> all(new_tabs);
  res := res || 'Z3 existing policies unchanged=' || (h = '09faae92981d0f2f5f20f754f52b5661') || E'\n';
  select md5(string_agg(pg_get_triggerdef(t.oid), ',' order by t.tgrelid::regclass::text, tgname)) into h
    from pg_trigger t where not tgisinternal and t.tgrelid::regclass::text !~ '^(auth|storage|realtime)\.' and tgname <> 'trg_guard_mfg_membership';
  res := res || 'Z4 existing triggers unchanged=' || (h = 'f54b63ac9809a719f1c17b3277cb559b') || E'\n';

  ---------------------------------------------------------------- A. existing companies are Standard
  select tenant_edition(t1) into st;
  res := res || 'A1 existing company edition=' || st || E' (expect STANDARD)\n';

  ---------------------------------------------------------------- B. the edition is closed until the teacher opens it
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform switch_tenant(t1);
  begin perform create_mfg_company('zz Mfg Co', '2026-01-01', 'STANDARD'); res := res || E'FAIL created while the edition is closed\n';
  exception when others then res := res || 'B1 student refused while closed: ' || sqlerrm || E'\n'; end;
  begin perform set_edition_enabled('MANUFACTURING', true); res := res || E'FAIL a student opened the edition\n';
  exception when others then res := res || 'B2 student cannot open the edition: ' || sqlerrm || E'\n'; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform set_edition_enabled('MANUFACTURING', true);
  begin perform set_edition_enabled('STANDARD', false); res := res || E'FAIL Standard was switched off\n';
  exception when others then res := res || 'B3 Standard cannot be switched off: ' || sqlerrm || E'\n'; end;

  ---------------------------------------------------------------- C. creating the company
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c0 from memberships where user_id = s1;
  mfg := create_mfg_company('zz Mfg Co', '2026-01-01', 'STANDARD');
  res := res || 'C1 created; edition=' || tenant_edition(mfg) || '; active=' || (my_tenant_id() = mfg) || E'\n';
  select count(*) into c from accounts;
  res := res || 'C2 accounts=' || c || E' (expect 41)\n';
  select count(*) into c from accounts where code in ('1000','1100','1150','1160','1200','1500','1590','2000','2100','2110','2120','2130','2200','3000','4000','5000','5100','5200','5300','5310','5320','5400');
  res := res || 'C3 Standard codes kept=' || c || E' (expect 22)\n';
  select count(*) into c from mfg_account_determination;
  res := res || 'C4 determination keys=' || c || E' (expect 23)\n';
  select count(*) into c from mfg_account_determination d join accounts a on a.id = d.account_id and a.tenant_id = d.tenant_id;
  res := res || 'C5 every key points at this company''s own account=' || c || E' (expect 23)\n';
  select costing_method into st from mfg_company_settings;
  res := res || 'C6 costing=' || st || '; settings rows=' || (select count(*) from mfg_company_settings) || E'\n';
  select count(*) into c from memberships where user_id = s1;
  res := res || 'C7 memberships=' || c || ' (expect ' || (c0 + 1) || ': what the student already had, plus the Manufacturing company) ok=' || (c = c0 + 1) || E'\n';
  begin perform create_mfg_company('zz second', '2026-01-01', 'ACTUAL'); res := res || E'FAIL second Manufacturing company allowed\n';
  exception when others then res := res || 'C8 second company refused: ' || sqlerrm || E'\n'; end;
  begin perform create_mfg_company('', '2026-01-01', 'ACTUAL'); res := res || E'FAIL empty name accepted\n';
  exception when others then res := res || E'C9 empty name refused\n'; end;
  perform record_edition_open('MANUFACTURING', mfg);
  begin perform record_edition_open('STANDARD', mfg); res := res || E'FAIL wrong edition recorded\n';
  exception when others then res := res || E'C10 recording the wrong edition refused\n'; end;

  ---------------------------------------------------------------- D. students cannot rewrite the rules
  update mfg_company_settings set costing_method = 'ACTUAL' where tenant_id = mfg;
  select costing_method into st from mfg_company_settings where tenant_id = mfg;
  res := res || 'D1 direct costing update left it at ' || st || E' (expect STANDARD)\n';
  begin perform set_mfg_costing_method(mfg, 'ACTUAL'); res := res || E'FAIL student changed costing\n';
  exception when others then res := res || 'D2 student costing change refused: ' || sqlerrm || E'\n'; end;
  begin perform update_mfg_settings(mfg, null, 'PRORATE', 'COGS', true); res := res || E'FAIL student changed settings\n';
  exception when others then res := res || E'D3 student settings change refused\n'; end;
  begin insert into tenant_editions (tenant_id, edition) values (t1, 'MANUFACTURING'); res := res || E'FAIL student wrote tenant_editions\n';
  exception when others then res := res || E'D4 student cannot write tenant_editions\n'; end;
  update edition_settings set enabled = false where edition = 'MANUFACTURING';
  select enabled::text into st from edition_settings where edition = 'MANUFACTURING';
  res := res || 'D5 student update of the switch left enabled=' || st || E' (expect true)\n';
  begin perform assert_mfg_tenant(t1); res := res || E'FAIL Standard company passed the Manufacturing check\n';
  exception when others then res := res || 'D6 Standard company refused by Manufacturing check: ' || sqlerrm || E'\n'; end;
  begin perform mfg_account(t1, 'WIP'); res := res || E'FAIL Standard company has a WIP account\n';
  exception when others then res := res || E'D7 Standard company has no Manufacturing accounts\n'; end;

  perform switch_tenant(t1);
  select count(*) into c from mfg_company_settings;
  res := res || 'D8 with a Standard company active, Manufacturing settings visible=' || c || E' (expect 0)\n';
  select count(*) into c from mfg_account_determination;
  res := res || 'D9 with a Standard company active, determination rows visible=' || c || E' (expect 0)\n';
  perform switch_tenant(mfg);

  ---------------------------------------------------------------- E. the reused Standard engines run in a Manufacturing company
  select id into a_cash from accounts where code = '1000';
  select id into a_opex from accounts where code = '5100';
  insert into customers (tenant_id, name) values (mfg, 'zz customer') returning id into cust;
  insert into invoices (tenant_id, customer_id, order_date, total, tax_rate, tax_amount, status)
    values (mfg, cust, '2026-11-10', 1120, 12, 120, 'draft') returning id into inv;
  insert into invoice_lines (invoice_id, description, qty, unit_price) values (inv, 'zz chairs', 1, 1000);
  perform post_invoice(inv);
  select document_number into st from invoices where id = inv;
  res := res || 'E1 invoice posted as ' || st || E'\n';
  select count(*) into c from journal_entries where source_table = 'invoices' and source_id = inv;
  res := res || 'E2 journal entries for the invoice=' || c || E' (expect 1: revenue only, no COGS)\n';
  select coalesce(sum(jl.debit), 0) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id
    where e.source_id = inv and a.code = '1100';
  res := res || 'E3 A/R debited=' || n || E' (expect 1120)\n';
  perform record_invoice_payment(inv, 1120, '2026-11-12', 'cash');
  select coalesce(sum(jl.debit - jl.credit), 0) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id
    where e.tenant_id = mfg and a.code = '1100';
  res := res || 'E4 A/R balance after payment=' || n || E' (expect 0)\n';

  insert into journal_entries (tenant_id, entry_date, memo) values (mfg, '2026-12-03', 'zz expense') returning id into je;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_opex, 500, 0), (je, a_cash, 0, 500);
  res := res || E'E5 manual journal entry accepted\n';

  insert into employees (tenant_id, name, title, salary, pay_type) values (mfg, 'zz worker', 'operator', 144000, 'monthly') returning id into emp;
  perform run_payroll_ph(mfg, '2026-11-30', jsonb_build_array(jsonb_build_object('employeeId', emp, 'gross', 12000, 'sssEE', 540, 'sssER', 1140,
    'philhealthEE', 300, 'philhealthER', 300, 'pagibigEE', 200, 'pagibigER', 200, 'withholdingTax', 0, 'loanDeduction', 0, 'netPay', 10960)), 'monthly');
  select count(*) into c from payroll_runs where tenant_id = mfg;
  res := res || 'E6 payroll runs=' || c || E'\n';

  insert into fixed_assets (tenant_id, name, purchase_date, cost, salvage_value, useful_life_months) values (mfg, 'zz machine', '2026-11-02', 60000, 0, 60) returning id into fa;
  perform record_depreciation(fa, 1000, '2026-11-30');
  res := res || E'E7 depreciation recorded\n';

  insert into recurring_entries (tenant_id, memo, frequency, start_date, next_run_date, active) values (mfg, 'zz rent', 'monthly', '2026-11-01', '2026-11-01', true) returning id into rec;
  insert into recurring_entry_lines (recurring_entry_id, account_id, debit, credit) values (rec, a_opex, 8000, 0), (rec, a_cash, 0, 8000);
  perform post_recurring_entry(rec);
  select next_run_date into d from recurring_entries where id = rec;
  res := res || 'E8 recurring rent posted; next due ' || d || E'\n';

  update tenants set books_locked_through = '2026-11-30' where id = mfg;
  begin insert into journal_entries (tenant_id, entry_date, memo) values (mfg, '2026-11-25', 'zz'); res := res || E'FAIL entry inside the lock\n';
  exception when others then res := res || E'E9 period lock enforced in a Manufacturing company\n'; end;

  select coalesce(sum(jl.debit) - sum(jl.credit), 0) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = mfg;
  res := res || 'E10 trial balance difference=' || n || E' (expect 0)\n';

  ---------------------------------------------------------------- F. teacher controls
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform set_mfg_costing_method(mfg, 'ACTUAL'); res := res || E'FAIL costing changed with open periods\n';
  exception when others then res := res || 'F1 costing change refused while periods are open: ' || sqlerrm || E'\n'; end;
  update tenants set books_locked_through = '2026-12-31' where id = mfg;
  perform set_mfg_costing_method(mfg, 'ACTUAL');
  select costing_method into st from mfg_company_settings where tenant_id = mfg;
  res := res || 'F2 after locking the period the teacher changed costing to ' || st || E'\n';
  perform update_mfg_settings(mfg, '2026-04-01', 'PRORATE', 'COGS', false);
  select variance_close_method || '/' || explain_postings::text || '/' || fiscal_year_start::text into st from mfg_company_settings where tenant_id = mfg;
  res := res || 'F3 settings updated: ' || st || E'\n';
  select count(*) into c from mfg_audit_log where tenant_id = mfg;
  res := res || 'F4 audit log rows=' || c || E' (expect 3: created, costing, settings)\n';

  ---------------------------------------------------------------- G. other students and the closed edition
  perform set_edition_enabled('MANUFACTURING', false);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform switch_tenant(t2);
  select count(*) into c from mfg_company_settings;
  res := res || 'G1 another student sees Manufacturing settings=' || c || E' (expect 0)\n';
  select count(*) into c from accounts where tenant_id = mfg;
  res := res || 'G2 another student sees our accounts=' || c || E' (expect 0)\n';
  select count(*) into c from tenant_editions where tenant_id = mfg;
  res := res || 'G3 another student sees our edition row=' || c || E' (expect 0)\n';
  begin perform join_tenant(mfg); res := res || E'FAIL joined a Manufacturing company while closed\n';
  exception when others then res := res || 'G4 joining a Manufacturing company while closed refused: ' || sqlerrm || E'\n'; end;
  begin perform create_mfg_company('zz other', '2026-01-01', 'STANDARD'); res := res || E'FAIL created while closed\n';
  exception when others then res := res || E'G5 creating while closed refused\n'; end;

  ---------------------------------------------------------------- H. the teacher deletes a Manufacturing company
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform delete_company(mfg);
  select count(*) into c from tenants where id = mfg;
  res := res || 'H1 company rows left=' || c || E' (expect 0)\n';
  select count(*) into c from tenant_editions where tenant_id = mfg;
  res := res || 'H2 edition rows left=' || c || E' (expect 0)\n';
  execute 'reset role';
  select (tenant_id = t1)::text into st from profiles where id = s1;
  res := res || 'H3 the student falls back to their Standard company=' || st || E'\n';

  ---------------------------------------------------------------- I. signed-out visitor
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  select count(*) into c from tenant_editions;
  res := res || 'I1 signed-out visitor sees edition rows=' || c || E' (expect 0)\n';
  begin perform create_mfg_company('zz', '2026-01-01', 'STANDARD'); res := res || E'FAIL anon created a company\n';
  exception when others then res := res || E'I2 signed-out visitor refused\n'; end;
  execute 'reset role';

  raise exception E'RESULTS\n%', res;
end $$;
