# Activity 2 Manufacturing — "Rattan Furniture Works, a full operation"

Status: scope agreed with the teacher (comprehensive, many transactions); build not started. Written 2026-10-27 so a later session can continue.

## Rules carried over from Activity 1 (do not skip)
- Answer key = run the whole set through the real `mfg_*` functions in a ROLLED-BACK transaction as a test student (see `supabase/tests/mfg_practice_set1_key.sql`), keep the snapshot as the fixture.
- The key must post exactly what the SCREENS post. Pilot lesson: the Confirm production screen passes **no employee**; the screens never set one. Check every function argument the screens pass (read the page code) before trusting the key.
- Then: `mfg_practice_snapshot` (extend it for new areas), the checker in `src/lib/mfgPracticeCheck.ts`, the expected figures stored in `mfg_practice_sets` (teacher only, migration), the handout + teacher key (`handbook-mfg/activity-N-.../build.py`), the answer-key company loader (`mfg__load_activity_N`, `mfg_open_answer_key` takes the activity id), the Reset button already exists.
- Then a REAL click-through pilot in the browser (it found 3 bugs last time). Use form_input for fields but click checkboxes with a real click (form_input does not trigger React state).
- Migrations and deploys need the teacher's explicit OK each time; the auto-mode check blocks apply_migration and `vercel deploy` until the user says so in the same turn.
- GateGuard hook: before the first Write of a new file state callers / no existing equivalent / data schema / the user's instruction verbatim, then retry the same Write.

## Prerequisite (built, committed, NOT applied): migration 0058
A student may own up to five Manufacturing companies (the old unique index is dropped; `create_mfg_company` keeps its text except the guard; `mfg__create_company_for` is rebuilt). The "+ New company" link in the Manufacturing menu opens `/mfg-setup?new=1`. Tested in a rolled-back run. Needs: apply 0058, deploy.

## Scope (comprehensive)
New empty company per student, STANDARD costing, December 2026 and January 2027 (two months, so closing December carries into January).

Master data: 3 vendors, 3 customers; raw materials (rattan strips, frames wood, varnish batch-tracked with expiry, fabric, foam, screws, cartons); semi-finished "Chair frame" and "Table frame" (two-level BOMs); finished "Rattan chair", "Dining table set", "Side table"; 3 work centers (Frame shop, Weaving, Finishing) with labor/machine/setup rates and overhead rate; a loom as a FIXED ASSET linked to the weaving work center; 3 hourly employees; units/conversions (buy rattan in bundles, stock in kg); storage locations; calendar.
Costing: cost estimates for every made item, released.
Opening: opening stock by stock adjustment on Dec 1 (check which account is credited), opening cash voucher.
Planning: forecast for January, three confirmed sales orders, run MRP, convert planned orders and requisitions into production and purchase orders; review planning exceptions.
Purchasing (about 8 documents): POs incl. a partial receipt, a late receipt, a price different from planned (PPV), a purchase unit conversion; receipt of the batch-tracked varnish with batch and expiry; inspection plan on two raw materials: receipt goes to quarantine, record results, decide (accept / scrap / return to vendor), a non-conformance report closed; vendor invoices matched (three-way), one invoice for part of an order; freight and customs as landed cost allocated; one vendor invoice voided and re-entered; vendor payments.
Production (about 6 orders): frame orders, then chair/table orders (consuming the frames), one backflushed, scrap and rework, material over-use variance, confirmations with real hours, a downtime log on weaving, a reversed confirmation, settle each order, one order left in progress at month end.
Shop floor: dispatch list, priorities, OEE view, upkeep (maintenance) logged on the loom.
Sales (about 6 orders): deliveries in parts, invoices with different due dates, a customer return/credit if supported, customer payments (some partial), one overdue invoice at month end.
HR: time entries, payroll run for each month (Standard payroll functions: `run_payroll_ph`, see `src/lib/philippinePayroll.ts`), 13th month if December.
Fixed assets: register the loom, record monthly depreciation; machine cost at real depreciation at month end.
Banking: bank account, deposits, payments, reconcile.
Finance: manual vouchers (accrual, reclass, a reversing entry), submit and approval path, a voucher reversal, recurring entry for rent.
Period end: settle and close December, then January in order.
Reports to read and answer: balance sheet, income statement, cash flow, trial balance, ageing, GR/IR, WIP, scrap loss, machine cost, integrity check, stock card, cost of goods manufactured.

## Build stages
1. Scenario with exact numbers + answer-key script run rolled back (find and fix call formats by reading `supabase/tests/integration_mfg_phase*.sql` and the page code). Aim for round numbers so standard costs have no rounding (minutes as multiples of 3, setup divisible by lot size).
2. Extend `mfg_practice_snapshot` (new migration) for inspections, NCRs, landed costs, assets, payroll, payments, vouchers; extend the checker and tests; store the set definition in `mfg_practice_sets`.
3. Handout (steps per screen, exact labels) + teacher key (expected balances, common slips).
4. Answer-key loader for Activity 2 (`mfg__load_activity_2`, release flag per activity).
5. Pilot through the browser as the test student in a brand-new company (needs 0058), fix bugs, rebuild PDFs, copy to `~/Desktop/Classroom ERP/2 Manufacturing ERP/Activity 2 Manufacturing`.

## Known quirks to remember
- `purchase_orders` has no `created_at`; list by `order_date`.
- Releasing a cost estimate always uses today's date (screen has no date).
- Settle order button appears only after the final confirmation AND the finished-goods receipt.
- Sales page "Convert to invoice" is the Standard path; Manufacturing invoices come from Shipping → Create invoice for what was delivered, then Sales → Send invoice.
- Period End lists the month before the first activity (October 2026) as open with nothing in it; ignore it.
