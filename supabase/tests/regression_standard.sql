-- ============================================================
-- Standard ERP regression test. Run AFTER the Manufacturing migrations are in place.
-- It exercises the Standard flows as a real student and the teacher, then ends with a
-- RAISE EXCEPTION so everything it creates is rolled back; the message is the report.
-- Any line starting with FAIL is a regression. Expected results are stated on each line.
--
-- Set s1/t1 to a student and their Standard company, t2 to another Standard company,
-- teach to the teacher's profile id.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  t1 uuid := '486537ec-789f-4bba-8fe2-e44c6be2e859';
  t2 uuid := '1386cbcc-ac13-4f8b-8bc4-ee4b1edf060e';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := '';
  c int; n numeric; st text; q numeric;
  newco uuid; cust uuid; itm uuid; inv uuid; vend uuid; bill uuid; po uuid; emp uuid; je uuid;
  a_cash uuid; a_opex uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform switch_tenant(t1);

  -- the Manufacturing edition is closed (the default), and Standard must not notice
  select count(*) into c from tenants where tenant_edition(id) <> 'STANDARD';
  res := res || 'R1 companies that are not Standard=' || c || E' (expect 0 before anyone sets up Manufacturing)\n';

  newco := create_tenant('zz regression co');
  select count(*) into c from accounts;
  res := res || 'R2 create_tenant still works: edition=' || tenant_edition(newco) || ', accounts=' || c || E' (expect STANDARD, 22)\n';
  perform join_tenant(t2);
  res := res || 'R3 join_tenant of a Standard company still works; active is t2=' || (my_tenant_id() = t2) || E'\n';
  perform switch_tenant(t1);
  select (select count(*) from memberships where user_id = s1) into c;
  res := res || 'R4 switch_tenant works; memberships=' || c || E'\n';

  select id into a_cash from accounts where code = '1000';
  select id into a_opex from accounts where code = '5100';

  -- sales chain with a stocked item: COGS and stock move exactly as before
  insert into customers (tenant_id, name) values (t1, 'zz cust') returning id into cust;
  insert into items (tenant_id, sku, name, qty_on_hand, unit_cost, reorder_point) values (t1, 'ZZR', 'zz regression item', 10, 40, 1) returning id into itm;
  insert into invoices (tenant_id, customer_id, order_date, total, tax_rate, tax_amount, status) values (t1, cust, '2026-11-10', 224, 12, 24, 'draft') returning id into inv;
  insert into invoice_lines (invoice_id, item_id, description, qty, unit_price) values (inv, itm, 'zz regression item', 2, 100);
  perform post_invoice(inv);
  select qty_on_hand into q from items where id = itm;
  select count(*) into c from journal_entries where source_table = 'invoices' and source_id = inv;
  res := res || 'R5 invoice with a stocked item: entries=' || c || ' (expect 2: sale + COGS), stock left=' || q || E' (expect 8)\n';
  select coalesce(sum(jl.debit), 0) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id
    where e.source_id = inv and a.code = '5000';
  res := res || 'R6 COGS posted=' || n || E' (expect 80)\n';
  perform record_invoice_payment(inv, 100, '2026-11-12', 'cash');
  perform void_invoice(inv, '2026-11-15');
  select qty_on_hand into q from items where id = itm;
  select coalesce(sum(amount), 0) into n from invoice_payments where invoice_id = inv;
  select status into st from invoices where id = inv;
  res := res || 'R7 void with a payment: status=' || st || ', stock restored=' || q || ', payments net=' || n || E' (expect void, 10, 0)\n';

  -- purchasing chain: PO -> bill -> payment; stock is added by name and cost updated
  insert into vendors (tenant_id, name) values (t1, 'zz vendor') returning id into vend;
  insert into purchase_orders (tenant_id, vendor_id, order_date, total, tax_rate, tax_amount, status) values (t1, vend, '2026-11-01', 300, 0, 0, 'sent') returning id into po;
  insert into purchase_order_lines (purchase_order_id, description, qty, unit_cost) values (po, 'zz regression item', 5, 60);
  bill := create_bill_from_po(po, '2026-11-02'::date, '2026-12-02'::date);
  perform post_bill(bill);
  select qty_on_hand, unit_cost into q, n from items where id = itm;
  res := res || 'R8 PO->bill->post: stock=' || q || ', unit cost=' || n || E' (expect 15 and 60)\n';
  perform record_bill_payment(bill, 300, '2026-11-20', 'cash');
  select count(*) into c from journal_entries where source_table = 'bills' and source_id = bill;
  res := res || 'R9 bill entries=' || c || E' (expect 1)\n';

  -- manual entry, payroll, lock: unchanged
  insert into journal_entries (tenant_id, entry_date, memo) values (t1, '2026-12-03', 'zz expense') returning id into je;
  insert into journal_lines (journal_entry_id, account_id, debit, credit) values (je, a_opex, 500, 0), (je, a_cash, 0, 500);
  insert into employees (tenant_id, name, title, salary, pay_type) values (t1, 'zz worker', 'tester', 144000, 'monthly') returning id into emp;
  perform run_payroll_ph(t1, '2026-11-30', jsonb_build_array(jsonb_build_object('employeeId', emp, 'gross', 12000, 'sssEE', 540, 'sssER', 1140,
    'philhealthEE', 300, 'philhealthER', 300, 'pagibigEE', 200, 'pagibigER', 200, 'withholdingTax', 0, 'loanDeduction', 0, 'netPay', 10960)), 'monthly');
  select count(*) into c from payroll_runs where tenant_id = t1 and run_date = '2026-11-30';
  res := res || 'R10 payroll run recorded=' || c || E'\n';
  update tenants set books_locked_through = '2026-11-30' where id = t1;
  begin insert into journal_entries (tenant_id, entry_date, memo) values (t1, '2026-11-20', 'zz'); res := res || E'FAIL lock not enforced\n';
  exception when others then res := res || E'R11 period lock enforced\n'; end;
  update tenants set books_locked_through = null where id = t1;

  -- books balance
  select coalesce(sum(jl.debit) - sum(jl.credit), 0) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id
   where e.tenant_id = t1 and e.created_at >= now();
  res := res || 'R12 entries created by this test balance, difference=' || n || E' (expect 0)\n';

  -- the teacher still deletes a Standard company
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform delete_company(newco);
  select count(*) into c from tenants where id = newco;
  res := res || 'R13 teacher deleted the Standard company; rows left=' || c || E' (expect 0)\n';
  execute 'reset role';

  raise exception E'STANDARD REGRESSION\n%', res;
end $$;
