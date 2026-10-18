-- ============================================================
-- Manufacturing ERP — Phase 8e integration test (migration 0045: the books integrity check).
--
-- Run it AFTER 0029–0045 are applied, or paste it after migration 0045 in one script (then nothing is saved at all).
-- It ends with a RAISE EXCEPTION, so everything it creates is rolled back; the message is the report.
-- Every line starts with PASS or FAIL — there must be no FAIL.
--
-- The story is the demo company. A healthy company passes every check. Then the stock record and a customer invoice are tampered with, as the
-- database owner (the only one who could), and the check must catch each one and name it; put right, it passes again.
-- ============================================================
do $$
declare
  s1 uuid := 'cd67a8a0-9f4a-4a20-aa60-31d6f223a73a';
  s2 uuid := '93f50ed0-92a8-41a2-9256-e42b7e09247a';
  teach uuid := 'cc6900e7-07e4-43b4-9d80-5a69d14ccd91';
  res text := ''; mfg uuid; c int; c2 int; n numeric; st text; rc int;
  m1 date := (date_trunc('month', current_date) - interval '1 month')::date;
  i_lum uuid; vend1 uuid; po uuid; pl uuid; vi uuid; bill uuid; sid uuid; inv uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated'; perform set_edition_enabled('MANUFACTURING', true); execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  mfg := create_mfg_company('zz Phase8e Co', '2026-01-01', 'STANDARD');
  perform mfg_load_demo();
  select m.item_id into i_lum from mfg_item_master m join items i on i.id = m.item_id where m.tenant_id = mfg and i.sku = 'LUM-NARRA';
  select id into vend1 from vendors where tenant_id = mfg and name like 'Cabanatuan%';

  ---------------------------------------------------------------- A. a healthy company
  select count(*), count(*) filter (where status = 'FAIL'), count(*) filter (where status = 'WARN') into c, c2, rc from mfg_integrity_check(mfg);
  res := res || case when c2 = 0 and c >= 14 then 'PASS ' else 'FAIL ' end || 'A1 the demo company passes every check (' || c || ' checks, ' || c2 || ' failed, ' || rc || E' warnings)\n';
  select string_agg(check_no || '=' || status, ' ' order by check_no) into st from mfg_integrity_check(mfg);
  res := res || 'INFO A2 ' || st || E'\n';
  select count(*) into c from mfg_integrity_check(mfg) where status = 'FAIL';
  if c > 0 then
    select string_agg(check_no || ' ' || title || ' expected ' || expected || ' found ' || actual, '; ') into st from mfg_integrity_check(mfg) where status = 'FAIL';
    res := res || 'INFO A3 failing: ' || st || E'\n';
  end if;

  ---------------------------------------------------------------- B. after more activity
  po := mfg_create_po(vend1, current_date, current_date + 3, jsonb_build_array(jsonb_build_object('item_id', i_lum, 'qty', 100, 'unit_price', 100)));
  select l.id into pl from purchase_order_lines l where l.purchase_order_id = po;
  perform mfg_post_goods_receipt(po, current_date, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 60)));
  vi := mfg_post_vendor_invoice(po, 'V-8E-1', current_date, current_date + 30, 12, jsonb_build_array(jsonb_build_object('po_line_id', pl, 'qty', 60, 'unit_price', 100)));
  select bill_id into bill from mfg_vendor_invoices where id = vi;
  perform record_bill_payment(bill, 2000, current_date, 'cash');
  select count(*) into c from mfg_integrity_check(mfg) where status = 'FAIL';
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'B1 still no failure after a receipt, an invoice and a part-payment (' || c || E' failed)\n';
  select status || ' ' || expected || '/' || actual into st from mfg_integrity_check(mfg) where check_no = 21;
  res := res || case when st like 'PASS %' then 'PASS ' else 'FAIL ' end || 'B2 vendor balances agree with Accounts Payable (expected/found ' || st || E')\n';

  ---------------------------------------------------------------- C. tampering with the stock record
  execute 'reset role';
  select id into sid from mfg_stock where tenant_id = mfg and item_id = i_lum limit 1;
  update mfg_stock set qty = qty + 5 where id = sid;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select status into st from mfg_integrity_check(mfg) where check_no = 31;
  res := res || case when st = 'FAIL' then 'PASS ' else 'FAIL ' end || 'C1 a stock balance that no document explains is caught: ' || st || E'\n';
  select count(*) into c from mfg_integrity_check(mfg) where area = 'Sub-ledger' and status = 'FAIL' and title like 'Raw materials%';
  res := res || case when c = 1 then 'PASS ' else 'FAIL ' end || 'C2 and the raw-materials stock no longer agrees with the ledger (' || c || E')\n';
  execute 'reset role';
  update mfg_stock set qty = qty - 5 where id = sid;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_integrity_check(mfg) where status = 'FAIL';
  res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'C3 put right, every check passes again (' || c || E' failed)\n';

  ---------------------------------------------------------------- D. tampering with a customer invoice
  execute 'reset role';
  select id into inv from invoices where tenant_id = mfg and status = 'fulfilled' order by order_date, id limit 1;
  if inv is null then
    res := res || E'INFO D1 the demo company has no fulfilled invoice to tamper with\n';
  else
    update invoices set total = total + 100 where id = inv;
    perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select status into st from mfg_integrity_check(mfg) where check_no = 20;
    res := res || case when st = 'FAIL' then 'PASS ' else 'FAIL ' end || 'D1 a customer balance that differs from Accounts Receivable is caught: ' || st || E'\n';
    execute 'reset role';
    update invoices set total = total - 100 where id = inv;
    perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select status into st from mfg_integrity_check(mfg) where check_no = 20;
    res := res || case when st = 'PASS' then 'PASS ' else 'FAIL ' end || 'D2 put right, it passes: ' || st || E'\n';
  end if;

  ---------------------------------------------------------------- E. negative stock
  execute 'reset role';
  update mfg_company_settings set allow_negative_stock = true where tenant_id = mfg;
  update mfg_stock set qty = -1 where id = sid;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select status into st from mfg_integrity_check(mfg) where check_no = 30;
  res := res || case when st = 'WARN' then 'PASS ' else 'FAIL ' end || 'E1 a negative stock balance only warns when the teacher has allowed it: ' || st || E'\n';
  execute 'reset role';
  update mfg_company_settings set allow_negative_stock = false where tenant_id = mfg;
  perform set_config('request.jwt.claims', json_build_object('sub', s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select status into st from mfg_integrity_check(mfg) where check_no = 30;
  res := res || case when st = 'FAIL' then 'PASS ' else 'FAIL ' end || 'E2 …and fails once it is not allowed: ' || st || E'\n';
  execute 'reset role';

  ---------------------------------------------------------------- F. who may look
  perform set_config('request.jwt.claims', json_build_object('sub', s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin perform * from mfg_integrity_check(mfg); res := res || E'FAIL F1 another student ran the check\n';
  exception when others then res := res || E'PASS F1 another student cannot run the check\n'; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', teach, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into c from mfg_integrity_check(mfg);
  res := res || case when c >= 14 then 'PASS ' else 'FAIL ' end || 'F2 the teacher can run it for a student''s company (' || c || E' checks)\n';
  begin perform delete_company(mfg); select count(*) into c from tenants where id = mfg;
    res := res || case when c = 0 then 'PASS ' else 'FAIL ' end || 'G1 the teacher deleted the company (left=' || c || E')\n';
  exception when others then res := res || 'FAIL G1 deleting the company failed: ' || sqlerrm || E'\n'; end;
  execute 'reset role';

  select count(*) into c from regexp_matches(res, '(^|\n)FAIL ', 'g'); n := c;
  raise exception E'MFG PHASE 8e — failures: %\n%', n, res;
end $$;
