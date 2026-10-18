-- ============================================================
-- Classroom ERP — migration 0045 (Manufacturing ERP, Phase 8e: the books integrity check)
--
-- Needs 0023–0044. One new READ-ONLY function; nothing is written, and no Standard object is touched.
--
--   mfg_integrity_check(tenant)  Runs the questions an auditor (or a careful accountant at month end) asks of the books, and answers each with
--                                PASS, FAIL or WARN, the figure expected, the figure found, and where to look:
--      Ledger        total debits = total credits; every entry balances; every line uses an account of this company.
--      Sub-ledgers   raw materials, packaging, work in process, finished goods and GR/IR agree with the stock records (mfg_reconciliation);
--                    customer balances agree with Accounts Receivable; vendor balances agree with Accounts Payable.
--      Stock         no negative balances (unless the teacher allowed them); each balance equals the sum of its documents;
--                    every stock document that changes value reached the ledger.
--      Purchasing    no order has received more than was ordered.
--      Production    a closed order holds no cost; nothing sits undecided in quality control for more than 30 days (warning).
--      Costing       stocked items without a standard cost (warning).
--
-- ROLLBACK:  drop function if exists mfg_integrity_check(uuid);
-- ============================================================

create or replace function mfg_integrity_check(p_tenant uuid)
returns table (check_no int, area text, title text, status text, expected text, actual text, detail text) as $$
declare
  n numeric; n2 numeric; c int; v_neg boolean; v_method text; r record;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  select coalesce(allow_negative_stock, false), costing_method into v_neg, v_method from mfg_company_settings where tenant_id = p_tenant;

  -- ---- ledger ----
  select round(coalesce(sum(jl.debit - jl.credit), 0), 2) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = p_tenant;
  check_no := 1; area := 'Ledger'; title := 'Total debits equal total credits (trial balance nets to zero)'; status := case when abs(n) < 0.01 then 'PASS' else 'FAIL' end;
  expected := '0.00'; actual := to_char(n, 'FM999,999,999,990.00'); detail := 'Reports → Trial balance'; return next;

  select count(*) into c from (select e.id from journal_entries e join journal_lines jl on jl.journal_entry_id = e.id where e.tenant_id = p_tenant
                                group by e.id having abs(sum(jl.debit) - sum(jl.credit)) >= 0.005) q;
  check_no := 2; area := 'Ledger'; title := 'Every journal entry balances on its own'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 entries out of balance'; actual := c || ' out of balance'; detail := 'Finance → Journal'; return next;

  select count(*) into c from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id where e.tenant_id = p_tenant and a.tenant_id <> p_tenant;
  check_no := 3; area := 'Ledger'; title := 'Every line posts to an account of this company'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 lines'; actual := c || ' lines'; detail := 'Chart of accounts'; return next;

  -- ---- stock records against the ledger ----
  c := 10;
  for r in select * from mfg_reconciliation(p_tenant) loop
    c := c + 1;
    check_no := c; area := 'Sub-ledger'; title := r.area || ' agree with account ' || r.account_code || ' ' || r.account_name;
    status := case when abs(r.difference) < 0.10 then 'PASS' else 'FAIL' end;
    expected := to_char(r.ledger, 'FM999,999,999,990.00'); actual := to_char(r.subledger, 'FM999,999,999,990.00');
    detail := 'Difference ' || to_char(r.difference, 'FM999,999,999,990.00') || ' — Inventory → Stock vs. books'; return next;
  end loop;

  select round(coalesce(sum(i.total - coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = i.id), 0)), 0), 2) into n
    from invoices i where i.tenant_id = p_tenant and i.status = 'fulfilled';
  select round(coalesce(sum(jl.debit - jl.credit), 0), 2) into n2 from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id
   where e.tenant_id = p_tenant and a.code = '1100';
  check_no := 20; area := 'Sub-ledger'; title := 'Customer balances agree with Accounts Receivable (1100)'; status := case when abs(n - n2) < 0.10 then 'PASS' else 'FAIL' end;
  expected := to_char(n2, 'FM999,999,999,990.00'); actual := to_char(n, 'FM999,999,999,990.00'); detail := 'Reports → Accounts receivable aging'; return next;

  select round(coalesce(sum(b.total - coalesce((select sum(p.amount) from bill_payments p where p.bill_id = b.id), 0)), 0), 2) into n
    from bills b where b.tenant_id = p_tenant and b.status = 'received';
  select round(coalesce(sum(jl.credit - jl.debit), 0), 2) into n2 from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id
   where e.tenant_id = p_tenant and a.code = '2000';
  check_no := 21; area := 'Sub-ledger'; title := 'Vendor balances agree with Accounts Payable (2000)'; status := case when abs(n - n2) < 0.10 then 'PASS' else 'FAIL' end;
  expected := to_char(n2, 'FM999,999,999,990.00'); actual := to_char(n, 'FM999,999,999,990.00'); detail := 'Purchasing → Vendor invoices'; return next;

  -- ---- stock ----
  select count(*) into c from mfg_stock where tenant_id = p_tenant and qty < 0;
  check_no := 30; area := 'Stock'; title := 'No stock balance is below zero'; status := case when c = 0 then 'PASS' when v_neg then 'WARN' else 'FAIL' end;
  expected := '0 balances'; actual := c || ' balances'; detail := case when v_neg and c > 0 then 'Negative stock is allowed for this company' else 'Inventory → Stock on hand' end; return next;

  select count(*) into c from (
    select coalesce(s.item_id, d.item_id) from mfg_stock s
    full join (select dl.item_id, dl.location_id, dl.batch_id, sum(dl.qty_change) q from mfg_material_doc_lines dl where dl.tenant_id = p_tenant group by 1, 2, 3) d
      on d.item_id = s.item_id and d.location_id = s.location_id and d.batch_id is not distinct from s.batch_id
    where coalesce(s.tenant_id, p_tenant) = p_tenant and abs(coalesce(s.qty, 0) - coalesce(d.q, 0)) > 0.000001) q;
  check_no := 31; area := 'Stock'; title := 'Each stock balance equals the sum of its documents'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 differences'; actual := c || ' differences'; detail := 'Inventory → Stock documents'; return next;

  select count(*) into c from mfg_material_documents d
   where d.tenant_id = p_tenant and d.doc_type <> 'TRF' and d.journal_entry_id is null
     and exists (select 1 from mfg_material_doc_lines l where l.doc_id = d.id and abs(l.total_cost) >= 0.005);
  check_no := 32; area := 'Stock'; title := 'Every stock document that changes value reached the ledger'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 documents'; actual := c || ' documents'; detail := 'Inventory → Stock documents'; return next;

  -- ---- purchasing ----
  select count(*) into c from purchase_order_lines pl join purchase_orders po on po.id = pl.purchase_order_id join mfg_po_line_items li on li.po_line_id = pl.id
   where po.tenant_id = p_tenant and coalesce((select sum(dl.qty_change) from mfg_material_doc_lines dl where dl.po_line_id = pl.id), 0) > pl.qty + 0.000001;
  check_no := 40; area := 'Purchasing'; title := 'No order has received more than was ordered'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 lines'; actual := c || ' lines'; detail := 'Purchasing → Purchase orders'; return next;

  select count(*) into c from mfg_vendor_invoices where tenant_id = p_tenant and mfg_vendor_invoices.status = 'HELD' and created_at < now() - interval '30 days';
  check_no := 41; area := 'Purchasing'; title := 'No vendor invoice has been on hold for more than 30 days'; status := case when c = 0 then 'PASS' else 'WARN' end;
  expected := '0 invoices'; actual := c || ' invoices'; detail := 'Purchasing → Vendor invoices'; return next;

  -- ---- production and quality ----
  select count(*) into c from mfg_production_orders o where o.tenant_id = p_tenant and o.status in ('CLOSED', 'LOCKED')
     and abs(coalesce((select sum(oc.amount) from mfg_order_costs oc where oc.order_id = o.id), 0)) >= 0.005;
  check_no := 50; area := 'Production'; title := 'A closed order holds no cost in work in process'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 orders'; actual := c || ' orders'; detail := 'Production → Orders → Settle'; return next;

  select count(*) into c from mfg_inspection_lots il where il.tenant_id = p_tenant and il.status in ('CREATED', 'IN_INSPECTION') and il.created_at < now() - interval '30 days';
  check_no := 51; area := 'Quality'; title := 'Nothing has waited more than 30 days for a quality decision'; status := case when c = 0 then 'PASS' else 'WARN' end;
  expected := '0 lots'; actual := c || ' lots'; detail := 'Quality → Inspection lots'; return next;

  -- ---- costing ----
  select count(*) into c from mfg_item_master m where m.tenant_id = p_tenant and m.active and m.item_type <> 'SERVICE' and v_method = 'STANDARD' and m.standard_cost = 0
     and exists (select 1 from mfg_stock s where s.item_id = m.item_id and s.qty > 0);
  check_no := 60; area := 'Costing'; title := 'Every item in stock has a standard cost'; status := case when c = 0 then 'PASS' else 'WARN' end;
  expected := '0 items'; actual := c || ' items'; detail := 'Costing → release a cost estimate'; return next;
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function mfg_integrity_check(uuid) from public, anon;
grant execute on function mfg_integrity_check(uuid) to authenticated;
