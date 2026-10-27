# Activity 2 Manufacturing — "Rattan Furniture Works, a full operation"

Status: ACTIVITY 2 COMPLETE AND DEPLOYED (2026-10-27) — all stages done; see the sections below for history. (old status follows) stage 1 PARTLY done. Migration 0058 is applied and deployed. A scratch answer-key company "ZZ Activity 2 key (delete me)" exists under the TEST student johnell (tenant fea19570-5449-4aca-a538-69172bdefcdd); delete it with the teacher's delete_company when the key is finished.
Done in the scratch company (all through the real mfg_* functions, December 2026 closed with no books-check failure): master data, 4 cost estimates (std: FRM-CH 475.75, FRM-TB 840.50, CHR-RT 1244.45, TBL-SD 1344.00), capital voucher 500,000, 3 confirmed sales orders, MRP, planned orders converted, requisitions converted into 3 POs (V1 Laguna Rattan and Timber: wood @98, rattan @160, screws @1; V2 Pasig Fabric and Foam: fabric 120, foam 85, cartons 40; V3 Batangas Coatings: varnish 320 batch VAR-1226-A expiry 2027-12-31), partial rattan receipt (140 then 45 on Dec 8), 4 production orders (frames first, chairs 70 with 2 scrap, tables 30), 3 vendor invoices, vendor payments, 3 deliveries (Cebu short by 2 chairs) + invoices + customer payments, loom asset + voucher + depreciation 3,000, upkeep plan, downtime, rent voucher, order settlement, December settle + close.
December GL by code: 1000=409832, 1100=72064, 1160=11079.60, 1500=120000, 1590=-3000, 2000=-37561.60, 2200=-20544, 3000=-500000, 4000=-171200, 5000=129199, 5100=24000, 5700=-22152, 5710=-3410, 5720=-8307.
Still to add to the key: inspection plan + quarantine + NCR, landed cost, a voided vendor invoice, payroll (run_payroll_ph), accrual/reversal voucher, January month (MRP again, second round of buying/making/selling, close January). Maintenance log can not be dated in the future (guard), so leave it out or make it optional. Convert-requisitions always dates the PO today.

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

## Stage 1 result (2026-10-27, later): key complete for December 2026 and January 2027 (both periods CLOSED)
January added: quality plan on rattan (receipt to Quarantine, moisture 13.5 out of 8-12, decide accept 57 / return 4, NCR closed, 4 kg redelivered and accepted), landed cost trucking 1,300 + 12% on wood and screws, varnish invoice at 340 vs order 320 (held, rejected, entered again at 320), chair confirmation reversed and reposted, Greenleaf 24 chairs + 6 tables, Cebu's last 2 chairs, customer and vendor payments, loom depreciation, rent and ads vouchers (ads booked to 5100 then reversed with mfg_reverse_voucher and re-booked to 5200).
Payroll LEFT OUT on purpose: run_payroll_ph takes a breakdown computed in the browser (philippinePayroll.ts); it belongs to the Standard HR module and Manufacturing labour cost already comes from activity rates.
Final GL (both months): 1000=415334.40, 1100=64064, 1160=14756.16, 1500=120000, 1590=-6000, 2000=-34314.56, 2200=-27408, 3000=-500000, 4000=-228400, 5000=173968, 5100=48000, 5200=5000, 5700=-29472, 5710=-4476, 5720=-11052.
Screen-faithfulness notes: goods receipt of an inspected item passes the Quarantine location_id (purchasing screen prefills it); frames need default location Raw Material Store so the issue screen finds them; a held invoice is rejected with mfg_reject_held_invoice, a posted one is voided with mfg_void_vendor_invoice; PO and sales-order dates for converted requisitions are today; maintenance log cannot be future-dated.
Next: stage 2 (extend mfg_practice_snapshot for inspection lots, NCRs, landed costs, assets, payments, voucher reversals; checker; definition in mfg_practice_sets).

## Stage 2 done (2026-10-27)
Migrations 0059 (mfg_practice_snapshot_a2) and 0060 (set rattan-dec-2026-jan-2027, teacher-only) APPLIED. Checker + tests committed (9 pass). Website code change (checker modal reads the a2 snapshot) NOT deployed yet. Next: stage 3 handout + teacher key PDFs, stage 4 loader mfg__load_activity_2 + generalize mfg_open_answer_key / release functions (hard-coded to activity-1-manufacturing), stage 5 browser pilot.

## Stage 4 done (2026-10-27)
Migration 0061 APPLIED (mfg__load_activity_2; release + open functions accept both activities). Tested end to end in rolled-back runs for both activities (key opens read-only with AUDITOR role; Activity 2 key GL = answer key). The scratch key company was DELETED. Website code (student card per activity, release buttons per set) committed, NOT deployed. Next: stage 3 handout + teacher key PDFs, stage 5 browser pilot, then deploy.

## Stage 5 pilot done (2026-10-27) — a real click-through on the live site as the test student
Company "ZZ Pilot Rattan Furniture Works" (owner johnell). Every step through the real screens; final books equal the answer key to the centavo (all 15 GL balances, 4 payments each way, 6 manual vouchers, 1 reversed confirmation, 1 reversed voucher, QI-0001/0002, NCR-0001 closed). The teacher's Check showed 107/109, the 2 failures being the pilot's own voided invoice (checker now ignores voided invoices and void bills).
Bug found and fixed (deployed): Planning "Create purchase order" could not create a vendor (Manufacturing has no vendor list); it now has "…or type a new vendor's name".
Things the handout MUST say (screens behave this way):
- Master data: item unit and default store; work centers keep the defaults (1 shift, 8 h, 85%, Mon-Fri) — only the name is typed; BOM/routing "Valid from" 1 Dec 2026 for BOMs; routing save draft then Activate; Activate has a confirm step; cost estimates: lot size + costing date 2026-12-01 -> Work out the cost -> Mark this cost -> Release as standard cost.
- Fixed overhead = Master Data -> Costing sheet -> Edit "Fixed overhead" -> "Plus ₱ per hour" 30.
- Finance: account fields are typed as "1000 — Cash"; voucher date, reversal date and settle date all DEFAULT TO TODAY — always change them.
- Production "Issue material to the order" is the submit button of an inline form (not a dialog): set the Date BEFORE clicking, or it posts today's date (the pilot did this once and reversed it).
- Production confirm form keeps the last hours; choose Operation 20 to see the final-confirmation box; scrap reason box appears when scrapped > 0.
- Period End: October and November are listed and must be settled and closed (empty) before December; the "Settle…" screen warns "not over yet" — go on.
- Shipping: "Post delivery" then "Create invoice for what was delivered" (set invoice date and due date first); then Sales -> Invoices -> Send invoice (confirm) ; payments via Details.
- Enter the PO-0004 vendor invoice only AFTER the 4 kg redelivery is received and inspected (the pilot entered it too early and voided it).
- Vendor invoice at a different price goes ON HOLD; reject it with a reason and a date.
Stages left: handout + teacher key PDFs (build.py in handbook-mfg/activity-2-manufacturing/, shots from the pilot company), deploy of the checker tweak, then delete the pilot company when the screenshots are taken.

## Finished (2026-10-27)
Migrations 0058-0061 applied. Website deployed (planning vendor box, per-activity key cards and release, Check reads the Activity 2 snapshot, voided-invoice tolerance). Handout and teacher key built (handbook-mfg/activity-2-manufacturing/build.py -> student.pdf, teacher-key.pdf), copied to ~/Desktop/Classroom ERP/2 Manufacturing ERP/Activity 2 Manufacturing and the project root. Scratch and pilot companies deleted. Not yet done: a real student run, and releasing the keys (teacher decides).
