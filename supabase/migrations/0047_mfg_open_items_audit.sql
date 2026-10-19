-- ============================================================
-- Classroom ERP — migration 0047 (Manufacturing ERP, Phase 9b: ageing, audit trail, two more integrity checks)
--
-- Needs 0046. Read-only functions plus a redefinition of our own mfg_integrity_check (0045). Nothing Standard is touched.
--
--   mfg_open_items   Receivables and payables ageing at a date: each unpaid customer invoice and vendor bill, its due date, how many days
--                    overdue and in which bucket. Replaces the receivables/payables ageing that was only on the reused Standard report page.
--   mfg_audit_trail  One chronological list of who did what: changes to master data (0043) and control events (vouchers posted, submitted,
--                    sent back, reversed; periods settled, closed, re-opened; invoices voided; and so on).
--   mfg_integrity_check  adds: every journal entry has a voucher number (FAIL); no voucher has waited for approval more than 30 days (WARN).
--
-- ROLLBACK:  drop function if exists mfg_audit_trail(uuid, date, date), mfg_open_items(uuid, date);   -- then re-run 0045 to restore mfg_integrity_check
-- ============================================================

create or replace function mfg_open_items(p_tenant uuid, p_as_of date)
returns table (side text, doc_no text, party text, doc_date date, due_date date, total numeric, paid numeric, balance numeric, days_overdue int, bucket text) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_as_of is null then raise exception 'Choose the date.'; end if;
  return query
  with ar as (
    select 'AR'::text as sd, i.document_number as dn, c.name as pn, i.order_date as dd, coalesce(i.due_date, i.order_date) as du, i.total as tt,
           coalesce((select sum(p.amount) from invoice_payments p where p.invoice_id = i.id and p.payment_date <= p_as_of), 0) as pd
      from invoices i left join customers c on c.id = i.customer_id where i.tenant_id = p_tenant and i.status = 'fulfilled' and i.order_date <= p_as_of
  ), ap as (
    select 'AP'::text, b.document_number, v.name, b.order_date, coalesce(b.due_date, b.order_date), b.total,
           coalesce((select sum(p.amount) from bill_payments p where p.bill_id = b.id and p.payment_date <= p_as_of), 0)
      from bills b left join vendors v on v.id = b.vendor_id where b.tenant_id = p_tenant and b.status = 'received' and b.order_date <= p_as_of
  ), u as (select * from ar union all select * from ap)
  select u.sd, u.dn, u.pn, u.dd, u.du, round(u.tt, 2), round(u.pd, 2), round(u.tt - u.pd, 2), greatest(p_as_of - u.du, 0),
         case when p_as_of <= u.du then 'Current' when p_as_of - u.du <= 30 then '1-30' when p_as_of - u.du <= 60 then '31-60' when p_as_of - u.du <= 90 then '61-90' else 'Over 90' end
    from u where abs(u.tt - u.pd) >= 0.005
   order by u.sd, u.du, u.dn;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_audit_trail(p_tenant uuid, p_from date, p_to date)
returns table (at timestamptz, kind text, who text, what text, ref text) as $$
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a period (from, to).'; end if;
  return query
  select * from (
    select c.changed_at, 'Master data'::text, coalesce(c.changed_by_name, 'System'),
           case c.action when 'CREATE' then 'Created' when 'DELETE' then 'Deleted'
                else 'Changed ' || replace(coalesce(c.field, ''), '_', ' ') || ': ' || coalesce(c.old_value, '—') || ' → ' || coalesce(c.new_value, '—') end,
           c.record_label
      from mfg_change_log c where c.tenant_id = p_tenant and c.changed_at::date between p_from and p_to
    union all
    select a.created_at, 'Control event'::text, coalesce(p.full_name, 'System'), replace(a.event, '_', ' ') || ' ' || coalesce(a.detail::text, ''),
           coalesce(a.detail->>'voucher', a.detail->>'invoice', a.detail->>'period', '')
      from mfg_audit_log a left join profiles p on p.id = a.created_by where a.tenant_id = p_tenant and a.created_at::date between p_from and p_to
  ) x order by 1 desc limit 2000;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_integrity_check(p_tenant uuid)
returns table (check_no int, area text, title text, status text, expected text, actual text, detail text) as $$
declare
  n numeric; n2 numeric; c int; v_neg boolean; v_method text; r record;
begin
  if not (p_tenant = my_tenant_id() or is_teacher()) then raise exception 'That company is not yours to look at.'; end if;
  perform assert_mfg_tenant(p_tenant);
  select coalesce(allow_negative_stock, false), costing_method into v_neg, v_method from mfg_company_settings where tenant_id = p_tenant;

  select round(coalesce(sum(jl.debit - jl.credit), 0), 2) into n from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id where e.tenant_id = p_tenant;
  check_no := 1; area := 'Ledger'; title := 'Total debits equal total credits (trial balance nets to zero)'; status := case when abs(n) < 0.01 then 'PASS' else 'FAIL' end;
  expected := '0.00'; actual := to_char(n, 'FM999,999,999,990.00'); detail := 'Reports → Trial balance'; return next;

  select count(*) into c from (select e.id from journal_entries e join journal_lines jl on jl.journal_entry_id = e.id where e.tenant_id = p_tenant
                                group by e.id having abs(sum(jl.debit) - sum(jl.credit)) >= 0.005) q;
  check_no := 2; area := 'Ledger'; title := 'Every journal entry balances on its own'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 entries out of balance'; actual := c || ' out of balance'; detail := 'Finance → Journal vouchers'; return next;

  select count(*) into c from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id where e.tenant_id = p_tenant and a.tenant_id <> p_tenant;
  check_no := 3; area := 'Ledger'; title := 'Every line posts to an account of this company'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 lines'; actual := c || ' lines'; detail := 'Chart of accounts'; return next;

  select count(*) into c from journal_entries e where e.tenant_id = p_tenant and not exists (select 1 from mfg_vouchers v where v.journal_entry_id = e.id);
  check_no := 4; area := 'Ledger'; title := 'Every journal entry has a voucher number'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 entries without a voucher'; actual := c || ' without a voucher'; detail := 'Finance → Journal vouchers'; return next;

  select count(*) into c from mfg_vouchers where tenant_id = p_tenant and mfg_vouchers.status = 'PENDING_APPROVAL' and submitted_at < now() - interval '30 days';
  check_no := 5; area := 'Ledger'; title := 'No voucher has waited for approval for more than 30 days'; status := case when c = 0 then 'PASS' else 'WARN' end;
  expected := '0 vouchers'; actual := c || ' vouchers'; detail := 'Finance → Journal vouchers'; return next;

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
  expected := to_char(n2, 'FM999,999,999,990.00'); actual := to_char(n, 'FM999,999,999,990.00'); detail := 'Reports → Receivables and payables ageing'; return next;

  select round(coalesce(sum(b.total - coalesce((select sum(p.amount) from bill_payments p where p.bill_id = b.id), 0)), 0), 2) into n
    from bills b where b.tenant_id = p_tenant and b.status = 'received';
  select round(coalesce(sum(jl.credit - jl.debit), 0), 2) into n2 from journal_lines jl join journal_entries e on e.id = jl.journal_entry_id join accounts a on a.id = jl.account_id
   where e.tenant_id = p_tenant and a.code = '2000';
  check_no := 21; area := 'Sub-ledger'; title := 'Vendor balances agree with Accounts Payable (2000)'; status := case when abs(n - n2) < 0.10 then 'PASS' else 'FAIL' end;
  expected := to_char(n2, 'FM999,999,999,990.00'); actual := to_char(n, 'FM999,999,999,990.00'); detail := 'Purchasing → Vendor invoices'; return next;

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

  select count(*) into c from purchase_order_lines pl join purchase_orders po on po.id = pl.purchase_order_id join mfg_po_line_items li on li.po_line_id = pl.id
   where po.tenant_id = p_tenant and coalesce((select sum(dl.qty_change) from mfg_material_doc_lines dl where dl.po_line_id = pl.id), 0) > pl.qty + 0.000001;
  check_no := 40; area := 'Purchasing'; title := 'No order has received more than was ordered'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 lines'; actual := c || ' lines'; detail := 'Purchasing → Purchase orders'; return next;

  select count(*) into c from mfg_vendor_invoices where tenant_id = p_tenant and mfg_vendor_invoices.status = 'HELD' and created_at < now() - interval '30 days';
  check_no := 41; area := 'Purchasing'; title := 'No vendor invoice has been on hold for more than 30 days'; status := case when c = 0 then 'PASS' else 'WARN' end;
  expected := '0 invoices'; actual := c || ' invoices'; detail := 'Purchasing → Vendor invoices'; return next;

  select count(*) into c from mfg_production_orders o where o.tenant_id = p_tenant and o.status in ('CLOSED', 'LOCKED')
     and abs(coalesce((select sum(oc.amount) from mfg_order_costs oc where oc.order_id = o.id), 0)) >= 0.005;
  check_no := 50; area := 'Production'; title := 'A closed order holds no cost in work in process'; status := case when c = 0 then 'PASS' else 'FAIL' end;
  expected := '0 orders'; actual := c || ' orders'; detail := 'Production → Orders → Settle'; return next;

  select count(*) into c from mfg_inspection_lots il where il.tenant_id = p_tenant and il.status in ('CREATED', 'IN_INSPECTION') and il.created_at < now() - interval '30 days';
  check_no := 51; area := 'Quality'; title := 'Nothing has waited more than 30 days for a quality decision'; status := case when c = 0 then 'PASS' else 'WARN' end;
  expected := '0 lots'; actual := c || ' lots'; detail := 'Quality → Inspection lots'; return next;

  select count(*) into c from mfg_item_master m where m.tenant_id = p_tenant and m.active and m.item_type <> 'SERVICE' and v_method = 'STANDARD' and m.standard_cost = 0
     and exists (select 1 from mfg_stock s where s.item_id = m.item_id and s.qty > 0);
  check_no := 60; area := 'Costing'; title := 'Every item in stock has a standard cost'; status := case when c = 0 then 'PASS' else 'WARN' end;
  expected := '0 items'; actual := c || ' items'; detail := 'Costing → release a cost estimate'; return next;
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function mfg_open_items(uuid, date) from public, anon;
revoke execute on function mfg_audit_trail(uuid, date, date) from public, anon;
grant execute on function mfg_open_items(uuid, date) to authenticated;
grant execute on function mfg_audit_trail(uuid, date, date) to authenticated;
