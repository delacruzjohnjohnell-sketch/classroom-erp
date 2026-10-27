-- ============================================================
-- Classroom ERP — migration 0052 (Manufacturing ERP, Phase 11b: practice-set answers kept in the database)
--
-- Needs 0050–0051. ADDITIVE ONLY: one new table and two read-only functions. No Standard object is touched.
--
--   Why   The expected figures of a practice set used to ship inside the website's JavaScript, where a curious student could read them.
--         They now live in this table, which has no policies (nobody can select from it), and only the teacher can fetch them through
--         the two functions below. The website code keeps only the checking logic.
--
--   mfg_practice_sets                 id, name, summary, definition (the expected figures and hints as JSON).
--   mfg_practice_set_list()           Teacher: the available sets (id, name, summary).
--   mfg_practice_set_get(p_id)        Teacher: one set's full definition.
--
-- ROLLBACK:  drop function if exists mfg_practice_set_get(text), mfg_practice_set_list(); drop table if exists mfg_practice_sets;
-- ============================================================

create table if not exists mfg_practice_sets (
  id         text primary key,
  name       text not null,
  summary    text not null,
  definition jsonb not null,
  created_at timestamptz not null default now()
);
alter table mfg_practice_sets enable row level security;     -- no policies: only the functions below can read it

create or replace function mfg_practice_set_list()
returns table (id text, name text, summary text) as $$
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the practice sets.'; end if;
  return query select s.id, s.name, s.summary from mfg_practice_sets s order by s.created_at, s.id;
end;
$$ language plpgsql stable security definer set search_path = public;

create or replace function mfg_practice_set_get(p_id text)
returns jsonb as $$
declare
  d jsonb;
begin
  if is_teacher() is not true then raise exception 'Only the teacher can see the practice sets.'; end if;
  select definition into d from mfg_practice_sets where id = p_id;
  if d is null then raise exception 'Unknown practice set.'; end if;
  return d;
end;
$$ language plpgsql stable security definer set search_path = public;

revoke execute on function mfg_practice_set_list() from public, anon;
revoke execute on function mfg_practice_set_get(text) from public, anon;
grant execute on function mfg_practice_set_list() to authenticated;
grant execute on function mfg_practice_set_get(text) to authenticated;

insert into mfg_practice_sets (id, name, summary, definition)
values ('bamboo-nov-2026', 'Activity 1 Manufacturing — Bamboo Basket Works, November 2026 (solo company)', 'Standard costing. One month: set up, buy, make, sell, a manual voucher, then settle and close November. Ends in a net profit of ₱10,105.95.', '{"id": "bamboo-nov-2026", "name": "Activity 1 Manufacturing — Bamboo Basket Works, November 2026 (solo company)", "summary": "Standard costing. One month: set up, buy, make, sell, a manual voucher, then settle and close November. Ends in a net profit of ₱10,105.95.", "vendors": ["Laguna Bamboo Traders", "Pasig Packaging Supply"], "customers": ["Cebu Gift Shop", "Greenleaf Home Store"], "employees": [{"name": "Aling Nena Reyes", "hourlyRate": 80}, {"name": "Mang Totoy Cruz", "hourlyRate": 90}], "workCenters": ["Finishing", "Weaving"], "rates": [{"workCenter": "Weaving", "kind": "LABOR", "rate": 80}, {"workCenter": "Weaving", "kind": "MACHINE", "rate": 25}, {"workCenter": "Finishing", "kind": "LABOR", "rate": 80}, {"workCenter": "Finishing", "kind": "MACHINE", "rate": 40}], "ohRate": 30, "items": [{"sku": "BAM-POLE", "name": "Bamboo pole", "type": "RAW", "uom": "PC", "plannedPrice": 45, "qty": 80}, {"sku": "RAT-STR", "name": "Rattan strip", "type": "RAW", "uom": "KG", "plannedPrice": 160, "qty": 32}, {"sku": "LAC-CL", "name": "Clear lacquer", "type": "RAW", "uom": "L", "plannedPrice": 280, "qty": 20}, {"sku": "CTN-GB", "name": "Gift carton", "type": "PACKAGING", "uom": "PC", "plannedPrice": 30, "qty": 30}, {"sku": "BSK-LD", "name": "Laundry basket", "type": "FINISHED", "uom": "PC", "standardCost": 599.15, "qty": 3}, {"sku": "STD-PL", "name": "Plant stand", "type": "FINISHED", "uom": "PC", "standardCost": 563.85, "qty": 10}], "boms": [{"item": "BSK-LD", "lines": [{"sku": "BAM-POLE", "qty": 4}, {"sku": "CTN-GB", "qty": 1}, {"sku": "LAC-CL", "qty": 0.1}, {"sku": "RAT-STR", "qty": 1.5}]}, {"item": "STD-PL", "lines": [{"sku": "BAM-POLE", "qty": 6}, {"sku": "CTN-GB", "qty": 1}, {"sku": "LAC-CL", "qty": 0.25}, {"sku": "RAT-STR", "qty": 0.5}]}], "routings": [{"item": "BSK-LD", "ops": [{"op": 10, "workCenter": "Weaving", "setup": 30, "run": 42, "labor": 42, "machine": 12}, {"op": 20, "workCenter": "Finishing", "setup": 15, "run": 15, "labor": 15, "machine": 15}]}, {"item": "STD-PL", "ops": [{"op": 10, "workCenter": "Weaving", "setup": 30, "run": 30, "labor": 30, "machine": 24}, {"op": 20, "workCenter": "Finishing", "setup": 12, "run": 18, "labor": 18, "machine": 18}]}], "purchaseOrders": [{"vendor": "Laguna Bamboo Traders", "total": 38600}, {"vendor": "Pasig Packaging Supply", "total": 11700}], "vendorInvoices": [{"total": 13104, "invoiceDate": "2026-11-10", "due": "2026-12-10"}], "orders": [{"item": "BSK-LD", "planned": 50, "good": 48, "scrap": 2}, {"item": "STD-PL", "planned": 20, "good": 20, "scrap": 0}], "invoices": [{"total": 35728, "date": "2026-11-21", "due": "2026-12-21"}, {"total": 13272, "date": "2026-11-27", "due": "2026-12-27"}], "balances": [{"code": "1000", "amount": 94000, "hint": "Cash is the 100,000 capital less the 6,000 rent. No payments are made in this set, so nothing else touches Cash."}, {"code": "1100", "amount": 49000, "hint": "Both invoices stay unpaid, including 12% VAT. Check the quantities, prices and that each invoice was posted once."}, {"code": "1160", "amount": 1404, "hint": "12% input VAT on the one vendor invoice only."}, {"code": "1200", "amount": 14320, "hint": "Raw materials left after the two production orders, valued at standard cost. Check receipts, issues (including the extra rattan on the basket order) and quantities."}, {"code": "1220", "amount": 7435.95, "hint": "Finished goods left after the deliveries, at standard cost. Check receipts (48 baskets, 20 stands) and deliveries (45 baskets, 10 stands)."}, {"code": "1230", "amount": 900, "hint": "Gift cartons left, at standard cost."}, {"code": "2000", "amount": -13104, "hint": "The one vendor invoice, including 12% VAT, and no payment."}, {"code": "2050", "amount": -38600, "hint": "The bamboo and rattan receipt that was never invoiced, at purchase-order prices."}, {"code": "2200", "amount": -5250, "hint": "12% output VAT on the two invoices."}, {"code": "3000", "amount": -100000, "hint": "The 100,000 capital voucher."}, {"code": "4000", "amount": -43750, "hint": "Sales before VAT on both invoices."}, {"code": "5000", "amount": 36208.05, "hint": "Cost of goods sold at standard cost, plus the variances that Period End closes into it."}, {"code": "5100", "amount": 6000, "hint": "The 6,000 November rent only."}, {"code": "5300", "amount": -5430.5, "hint": "This credit is expected: Period End moves the labor applied to production out of Payroll Expense. Payroll is not run in this set."}, {"code": "5710", "amount": -1170, "hint": "Machine overhead applied at the standard machine rate; the settled balance after variances."}, {"code": "5720", "amount": -1963.5, "hint": "Fixed overhead applied at the standard overhead rate; the settled balance after variances."}], "manualVouchers": {"count": 2, "totalDebit": 106000}, "month": "2026-11"}'::jsonb)
on conflict (id) do update set name = excluded.name, summary = excluded.summary, definition = excluded.definition;
