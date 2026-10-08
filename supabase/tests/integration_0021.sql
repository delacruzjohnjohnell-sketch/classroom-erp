-- ============================================================
-- Integration test for migrations 0020–0021. Run it against a database that has
-- those migrations applied (or paste it after them in one script). It always ends
-- with a RAISE EXCEPTION, so everything it creates is rolled back; the exception
-- text is the report. Any line starting with FAIL is a problem.
--
-- Before running, set the four ids below to a real student (s1) and their company
-- (t1), a DIFFERENT company (t2), and the teacher's profile id.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  t1 uuid := '486537ec-789f-4bba-8fe2-e44c6be2e859';
  t2 uuid := '1386cbcc-ac13-4f8b-8bc4-ee4b1edf060e';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := '';
  c int; n numeric; d date; due date; st text;
  new_t uuid; vend uuid; bill uuid; po uuid; rec uuid; emp uuid; cust uuid; je uuid;
  a_cash uuid; a_opex uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  ------------------------------------------------------------------ A. memberships
  select count(*) into c from memberships where user_id = s1;
  res := res || 'A1 student sees own memberships=' || c || E'\n';

  ------------------------------------------------------------------ B. several companies, one account
  new_t := create_tenant('zz second company');
  select count(*) into c from memberships where user_id = s1;
  res := res || 'B1 created a 2nd company; memberships=' || c || '; active is new=' || (my_tenant_id() = new_t) || E'\n';
  select count(*) into c from invoices;
  res := res || 'B2 new company sees invoices=' || c || ' (expect 0), accounts=' || (select count(*) from accounts) || E' (expect 22)\n';
  insert into customers (tenant_id, name) values (new_t, 'zz isolation customer');

  perform switch_tenant(t1);
  select count(*) into c from invoices;
  res := res || 'B3 switched back; active is t1=' || (my_tenant_id() = t1) || '; sees invoices=' || c || E'\n';
  select count(*) into c from customers where name = 'zz isolation customer';
  res := res || 'B4 other company''s customer visible from t1=' || c || E' (expect 0)\n';

  begin perform switch_tenant(t2); res := res || E'FAIL switched to a company I am not in\n'; exception when others then res := res || E'B5 switch to non-member blocked\n'; end;
  begin update profiles set tenant_id = t2 where id = s1; res := res || E'FAIL direct profile update to a foreign company allowed\n'; exception when others then res := res || E'B6 direct profile update to foreign company blocked\n'; end;
  update profiles set tenant_id = new_t where id = s1;
  res := res || 'B7 direct update to a company I belong to ok; active=' || (my_tenant_id() = new_t) || E'\n';
  perform join_tenant(t2);
  select count(*) into c from memberships where user_id = s1;
  res := res || 'B8 joined an existing company; memberships=' || c || E'\n';
  perform switch_tenant(t1);

  select id into a_cash from accounts where tenant_id = t1 and code = '1000';
  select id into a_opex from accounts where tenant_id = t1 and code = '5100';

  ------------------------------------------------------------------ D. retroactive dates
  insert into vendors (tenant_id, name) values (t1, 'zz vendor') returning id into vend;
  insert into bills (tenant_id, vendor_id, order_date, due_date, total, tax_rate, tax_amount, status)
    values (t1, vend, '2026-11-05', '2026-12-05', 112, 12, 12, 'draft') returning id into bill;
  insert into bill_lines (bill_id, description, qty, unit_cost) values (bill, 'zz thing', 1, 100);
  perform post_bill(bill);
  select min(entry_date) into d from journal_entries where source_table = 'bills' and source_id = bill;
  select due_date into due from bills where id = bill;
  res := res || 'D1 bill dated Nov 5 posts on ' || d || ', due ' || due || E'\n';
  insert into purchase_orders (tenant_id, vendor_id, order_date, total, tax_rate, tax_amount, status)
    values (t1, vend, '2026-11-01', 100, 0, 0, 'sent') returning id into po;
  insert into goods_receipts (tenant_id, purchase_order_id, receipt_date, notes) values (t1, po, '2026-11-03', 'zz');
  select receipt_date into d from goods_receipts where purchase_order_id = po;
  res := res || 'D2 goods receipt keeps its typed date ' || d || E'\n';

  ------------------------------------------------------------------ E. recurring rent across periods
  insert into recurring_entries (tenant_id, memo, frequency, start_date, next_run_date, active)
    values (t1, 'zz rent', 'monthly', '2026-11-01', '2026-11-01', true) returning id into rec;
  insert into recurring_entry_lines (recurring_entry_id, account_id, debit, credit) values (rec, a_opex, 8000, 0), (rec, a_cash, 0, 8000);
  je := post_recurring_entry(rec);
  select entry_date into d from journal_entries where id = je;
  select next_run_date into due from recurring_entries where id = rec;
  res := res || 'E1 first post dated ' || d || ', next due ' || due || E'\n';
  je := post_recurring_entry(rec);
  select entry_date into d from journal_entries where id = je;
  select next_run_date into due from recurring_entries where id = rec;
  res := res || 'E2 second post dated ' || d || ', next due ' || due || E'\n';
  je := post_recurring_entry(rec, '2027-01-03');
  select entry_date into d from journal_entries where id = je;
  select next_run_date into due from recurring_entries where id = rec;
  res := res || 'E3 post with an explicit date ' || d || '; schedule still moves from its due date -> ' || due || E'\n';
  update recurring_entries set next_run_date = '2026-01-31', active = true where id = rec;
  perform post_recurring_entry(rec);
  select next_run_date into due from recurring_entries where id = rec;
  res := res || 'E4 Jan 31 monthly advances to ' || due || E' (expect 2026-02-28)\n';
  update recurring_entries set end_date = '2026-03-01', next_run_date = '2026-02-28' where id = rec;
  perform post_recurring_entry(rec);
  select active into st from recurring_entries where id = rec;
  res := res || 'E5 passing the end date deactivates it; active=' || st || E'\n';
  begin perform post_recurring_entry(rec); res := res || E'FAIL posted an ended recurring entry\n'; exception when others then res := res || 'E6 ended entry refused: ' || sqlerrm || E'\n'; end;

  ------------------------------------------------------------------ F. payroll over several periods, edited employee
  insert into employees (tenant_id, name, title, salary, pay_type) values (t1, 'zz employee', 'tester', 144000, 'monthly') returning id into emp;
  perform run_payroll_ph(t1, '2026-11-30', jsonb_build_array(jsonb_build_object('employeeId', emp, 'gross', 12000, 'sssEE', 540, 'sssER', 1140,
    'philhealthEE', 300, 'philhealthER', 300, 'pagibigEE', 200, 'pagibigER', 200, 'withholdingTax', 0, 'loanDeduction', 0, 'netPay', 10960)), 'monthly');
  update employees set name = 'zz employee renamed', salary = 180000 where id = emp;
  perform run_payroll_ph(t1, '2026-12-31', jsonb_build_array(jsonb_build_object('employeeId', emp, 'gross', 15000, 'sssEE', 675, 'sssER', 1425,
    'philhealthEE', 375, 'philhealthER', 375, 'pagibigEE', 200, 'pagibigER', 200, 'withholdingTax', 0, 'loanDeduction', 0, 'netPay', 13750)), 'monthly');
  select count(*) into c from payroll_runs where tenant_id = t1 and run_date in ('2026-11-30', '2026-12-31');
  res := res || 'F1 two payroll runs recorded=' || c || E'\n';
  select gross into n from payroll_run_lines l join payroll_runs r on r.id = l.payroll_run_id where l.employee_id = emp and r.run_date = '2026-11-30';
  res := res || 'F2 November line still shows the pay it recorded=' || n || ' (expect 12000) after a raise to 180000' || E'\n';
  select count(*) into c from journal_entries where tenant_id = t1 and entry_date in ('2026-11-30', '2026-12-31') and memo like 'Payroll run%';
  res := res || 'F3 payroll entries dated at each month-end=' || c || E'\n';
  select name, salary into st, n from employees where id = emp;
  res := res || 'F4 employee edits persisted: ' || st || ' / ' || n || E'\n';

  ------------------------------------------------------------------ C. the lock closes only the past
  update tenants set books_locked_through = '2026-11-30' where id = t1;
  begin insert into journal_entries (tenant_id, entry_date, memo) values (t1, '2026-11-30', 'zz'); res := res || E'FAIL entry on the lock date allowed\n'; exception when others then res := res || E'C1 entry dated on the lock date blocked\n'; end;
  begin insert into journal_entries (tenant_id, entry_date, memo) values (t1, '2026-10-15', 'zz'); res := res || E'FAIL entry before the lock allowed\n'; exception when others then res := res || E'C2 entry before the lock blocked\n'; end;
  insert into journal_entries (tenant_id, entry_date, memo) values (t1, '2026-12-01', 'zz');
  insert into journal_entries (tenant_id, entry_date, memo) values (t1, '2027-02-10', 'zz');
  res := res || E'C3 entries dated Dec 1 and Feb 10 (after the lock) accepted\n';
  begin perform run_payroll_ph(t1, '2026-11-30', '[]'::jsonb, 'monthly'); res := res || E'FAIL payroll into a locked month\n'; exception when others then res := res || E'C4 payroll into the locked month blocked\n'; end;
  perform run_payroll_ph(t1, '2027-01-31', jsonb_build_array(jsonb_build_object('employeeId', emp, 'gross', 15000, 'sssEE', 675, 'sssER', 1425,
    'philhealthEE', 375, 'philhealthER', 375, 'pagibigEE', 200, 'pagibigER', 200, 'withholdingTax', 0, 'loanDeduction', 0, 'netPay', 13750)), 'monthly');
  res := res || E'C5 payroll for January (after the lock) accepted\n';
  update recurring_entries set active = true, end_date = null, next_run_date = '2027-01-01' where id = rec;
  perform post_recurring_entry(rec);
  res := res || E'C6 rent for January (after the lock) accepted\n';
  update recurring_entries set next_run_date = '2026-11-01' where id = rec;
  begin perform post_recurring_entry(rec); res := res || E'FAIL rent into a locked month\n'; exception when others then res := res || E'C7 rent whose due date is inside the lock blocked\n'; end;
  update tenants set books_locked_through = null where id = t1;

  ------------------------------------------------------------------ anonymous visitor and teacher
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  select count(*) into c from memberships;
  res := res || 'G1 signed-out visitor sees memberships=' || c || E' (expect 0)\n';
  begin perform switch_tenant(t1); res := res || E'FAIL anon switch_tenant\n'; exception when others then res := res || E'G2 anon switch_tenant refused\n'; end;

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from memberships;
  res := res || 'G3 teacher reads all memberships=' || c || E'\n';
  update profiles set tenant_id = tenant_id where id = teach;
  res := res || E'G4 teacher profile update not blocked\n';

  execute 'reset role';
  raise exception E'RESULTS\n%', res;
end $$;
