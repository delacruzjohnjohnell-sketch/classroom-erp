# Activity 3 Manufacturing — the team-based practice set

Status (2026-10-27): design agreed (user answers: add role checks to team companies = YES; length = TWO MONTHS like Activity 2; user also wants it comprehensive and a little difficult; every role together must be enough to do the whole work). Migration 0062 written and tested (rolled back), NOT applied. Scenario/key not started. Written so a later session can continue. Follows the same method as `ACTIVITY_2_PLAN.md` (answer key = real functions in a rolled-back run; checker; stored set; handout + teacher key; key company; REAL click-through pilot; then deploy).

## The user's requirement (verbatim): "modifiable members assignment"
The team is NOT fixed. The teacher chooses how many students are in a team and which roles each holds, and can change that at any time. Therefore:
- Every task in the handout belongs to a ROLE, never to a named person or a seat number. A student reads the tasks of the roles they hold. One student may hold several roles; several students may hold the same role.
- The existing Teams screen already does the assignment (add student, tick any roles, change later): `/mfg/teams`, `mfg_company_roles`, 8 roles in `src/lib/mfgTeams.ts`. Nothing new is needed to assign members. A team of 2 can do the whole set (each holds several roles); a team of 7 gives every role its own student.
- The answer key and checker look at the COMPANY, not at people, so they do not care about team size.
- The scorecard (below) is per ROLE and shows which member(s) held it, so reassigning mid-way still reads correctly.

## Defaults I am using until the user says otherwise (the user did not answer the two questions I asked)
- Scenario: a NEW business (not Rattan), ONE month (February 2027), a team company made by the teacher. Short enough for one class block, but every role must hand work to the next.
- Marking: the existing Check on the team company, plus a per-role scorecard (who posted what).

## Role -> what the database lets them do (`mfg__role_areas`, migration 0049)
PURCHASING: purchasing, ap · WAREHOUSE: stock, issue, shipping · PRODUCTION: production, planning, master, issue · QUALITY: quality · SALES: sales, shipping · ACCOUNTANT: finance, ap, costing, settle · FINANCE_MANAGER: the accountant's plus close and approve · AUDITOR: read only. A voucher must be approved by someone other than its preparer.

## Scenario shape (to be fixed with exact numbers in stage 1)
Two-level product again so every role is busy, but a different business (suggestion: "Capiz Lantern Works": capiz shells, brass fittings, LED kits, cartons; semi-finished shade; finished pendant lamp and table lamp). Hand-offs that force teamwork:
1. PRODUCTION: items, bills, routings, work centers -> ACCOUNTANT: rates, overhead, cost estimates (costing area) -> back to PRODUCTION: planning run, production orders.
2. SALES: customers, sales orders. PURCHASING: vendors and purchase orders from requisitions. WAREHOUSE: receipts and issues. QUALITY: inspection of one receipt, a non-conformance report.
3. ACCOUNTANT prepares a journal voucher; FINANCE_MANAGER approves it (never the preparer); ACCOUNTANT settles orders; FINANCE_MANAGER closes the month.
4. WAREHOUSE delivers; SALES invoices; ACCOUNTANT / FINANCE_MANAGER record payments.
Roles that nobody holds in a small team are simply held by someone else; the handout says so.

## Build stages
1. Scenario with exact numbers; answer-key script run rolled back as a TEAM company with the student holding all roles (like `mfg__load_activity_2`); check every call exactly as the screens pass it; check which roles may post each step.
2. Snapshot: reuse `mfg_practice_snapshot_a2`; add a per-role scorecard function (documents by `created_by` joined to `mfg_company_roles`) — teacher only, read only; checker extension if a new area appears; store the set in `mfg_practice_sets` (new migration).
3. Loader `mfg__load_activity_3` + allow `'activity-3-manufacturing'` in the release and open-key functions (same replace trick as migration 0061); a team company's key opens as the student's own read-only company (already works for teams: `mfg__release_users`).
4. Handout (steps grouped BY ROLE, with a hand-off line after each group) and teacher key (how to build the team on the Teams screen; small-team and large-team examples).
5. A real click-through pilot as a team: the test student `johnell` holds roles in a team company made by the teacher; change the roles on the Teams screen to prove the modifiable assignment; also prove a role refusal (e.g. a warehouse clerk cannot create a PO).
6. Deploy (needs the user's OK each time), PDFs to `~/Desktop/Classroom ERP/2 Manufacturing ERP/Activity 3 Manufacturing`.

## Rules carried over (do not skip)
Key = what the SCREENS post (dates default to today; the issue-material button posts at once). Migrations and deploys need the user's explicit OK in the same turn. GateGuard: state callers/API/schema/the user's words before the first Write of a new file. Never `git add -A` (the root has the user's PDFs). Never persist test data under real students (johnell is the test student; delete scratch companies with the teacher's `delete_company`).

## Role coverage audit (done 2026-10-27)
- Every area used by a posting function is held by at least one role (purchasing/ap: Purchasing; stock/issue/shipping: Warehouse; production/planning/master/issue: Production; quality: Quality; sales/shipping: Sales; finance/ap/costing/settle: Accountant; + close/approve: Finance manager). So the working roles together CAN do all 69 posting functions. Only 'admin' (load demo) is the teacher's.
- GAP found: 9 screens wrote straight to tables / called shared Standard functions with NO role check, so any team member (even an Auditor or no role) could add customers, vendors, sales orders, quotes, invoices, work centers, units, locations, holidays, activity rates, overhead sheet, cost centers, fixed assets, recurring entries, chart-of-accounts rows, or record customer/vendor payments, depreciation, recurring entries, and Send invoice.
- FIX: `supabase/migrations/0062_mfg_team_role_gate.sql` (triggers + one line in 5 Standard functions, only for TEAM companies and only for MEMBERS; solo companies, the Standard ERP and the teacher unchanged). Areas: sales -> customers, quotes, sales orders (add/delete/confirm), new invoices, Send invoice; purchasing -> vendors; master -> work centers, units, conversions, locations, holidays; costing -> rates, overhead sheet, cost centers; finance -> assets, depreciation, recurring entries, customer payments, add/delete accounts; ap -> pay vendors. Tested in a rolled-back run with 15 checks (sales, no role, auditor, production+purchasing, accountant, solo company): all pass.
- Who does what after 0062 (use this to write the handout by ROLE): Production = items, BOMs, routings, work centers, units, locations, planning/MRP, production orders, confirmations, shop floor. Accountant = rates, overhead sheet, cost estimates, vouchers, vendor invoices, landed cost, payments received/made, assets and depreciation, settle orders and the month. Finance manager = the same + approve vouchers, close the month. Purchasing = vendors, POs, vendor invoices/landed cost, pay vendors. Warehouse = goods receipts, stock moves/adjustments, issue material, deliveries. Quality = inspection plans/lots/NCR. Sales = customers, quotes, sales orders, create invoices from deliveries, Send invoice.
- Open point: customer payments are 'finance' (Accountant/Finance manager). If the user wants Sales to take payments, change that one line.

## Harder items to include (user: comprehensive and a little difficult), two months
BOM change with a new version and a re-costed standard; purchase unit conversion (buy in bundles, stock in kg); a stock count difference (adjustment) and a transfer between stores; held vendor invoice APPROVED by the Finance manager; a by-product sold as scrap; a voucher that must be approved by someone other than its preparer; a reversed confirmation; landed cost; inspection with return/rework; downtime; fixed asset and depreciation; backflushed component; a recurring entry for rent. Two months closed in order (October and November also need closing first).
