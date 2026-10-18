# JJ and Co. Manufacturing ERP — audit

Date of audit: 2026-10-18. Scope: the Manufacturing edition (migrations 0023–0040, `/mfg/*` screens) and its effect on the Standard ERP.
Everything below was checked by running something; where I could not check, it says so.

## 1. What was checked, and how

| Area | Method | Result |
|---|---|---|
| Database logic | 13 rolled-back SQL dry-runs, one per phase (`supabase/tests/`), each ending in a forced error so nothing is saved | All last-run reports had 0 failures (phase 7a and 7b re-run during this build; earlier phases at their own deploy) |
| Standard ERP untouched | Four fingerprints (every existing function, column, policy, trigger) inside every Manufacturing test | Identical to the original in every run through 7b |
| Unit tests | `npm test` | 130 pass, 0 fail |
| Types, lint, build | `tsc --noEmit`, `eslint .`, `next build` | Clean |
| Migrations vs live database | Compared the repo's 40 files with the database's applied list | No drift; every file applied, in order |
| Row-level security | Queried all 54 `mfg_` tables | All have RLS and a policy; 9 master-data tables are client-writable by design (own company, students only), the other 45 are written only through functions |
| Function exposure | Queried all 145 `mfg*` functions | No security-definer function without a fixed search path; none executable by `anon` |
| Supabase advisors | Security and performance reports, every entry read | See section 3 |
| Screens ↔ database: function calls | Extracted all 111 `supabase.rpc(...)` calls and their parameter names; compared with the live function signatures | 0 mismatches (method proved with a deliberate bad call) |
| Screens ↔ database: tables and columns | Extracted 76 tables / 458 columns the screens read or write, plus 28 embedded joins | **2 real defects found** (section 2, F1); embedded joins all valid |
| Standard reports on a Manufacturing company | Loaded the demo under standard and actual costing and recomputed the reports | See section 4 |
| Live site | Signed-out requests to every route | All return 200 (this proves the pages are served, not that they work signed in) |

**Not checked, and why:** no one has clicked through the signed-in screens in a browser during this audit. Signing in needs a student or teacher account, and I do not create accounts or handle credentials. The only evidence for screen behaviour is compilation, lint, the call/column cross-checks above, and the database tests that exercise the same functions.

## 2. Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| F1 | **High** | Two screens asked for a column that does not exist and showed an empty result instead of an error: the **Vendor invoice** screen sorted purchase orders by `created_at` (the table has none), so its purchase-order picker was empty and no vendor invoice could be entered from the screen; the **Landed cost** screen sorted receipt lines by `created_at` (none), so no receipt could be selected. Both shipped in phase 4c. The database functions behind them are tested and work; only the screen queries failed. | **Fixed in the repo** (this commit). **Not deployed.** Both screens now sort on a column that exists and show the database's error message if a query fails. |
| F2 | Medium | There is no end-to-end test. F1 passed every database test, type check and lint, and was found only by cross-checking the screens' queries against the schema. Any screen-level mistake of this kind can still ship. | Open. Recommend a small browser smoke test against a throw-away project (one student, one teacher), or keeping the cross-check as a repeatable script. |
| F3 | Medium | Most screens do not tell the user when a query fails: they treat an error as "no data". Screens with no error handling at all: the Manufacturing home page (11 queries), `useLookups` (7 queries, feeds every screen), cost estimate detail, postings panel, variance panel, BOM/routing lists. This is what let F1 hide. | Open. Recommend one shared helper that shows the error and use it in these. |
| F4 | Low | `mfg_order_wip(order)` and `mfg_account(tenant, key)` are security-definer and callable by any signed-in user for any company. They return an order's work-in-process cost or a ledger account id if the caller knows the id. The ids are random and nothing in the screens calls these two. | Open. Fix in a small migration: revoke execute from clients (they stay usable inside the other functions). |
| F5 | Low | Five small helper functions have no fixed search path (`mfg__inv_key`, `mfg__avg_after`, `mfg__bucket`, `mfg__lot_qty`, `mfg_moving_average`). They only do arithmetic. `guard_mfg_membership` (a trigger function) is executable by `anon` through the API though it does nothing there. | Open. Same migration: set the search path, revoke execute. |
| F6 | Low | Supabase Auth's "leaked password protection" is switched off (advisor warning). | Open. A dashboard setting for you: Authentication → Passwords. |
| F7 | Info | 84 foreign keys on Manufacturing tables have no covering index, 4 indexes are unused, 45 Manufacturing tables show "multiple permissive policies" (the nine editable master tables carry a read and a write policy). 18 Row-security "initplan" warnings are all on Standard tables. Harmless at classroom size (hundreds of rows); worth indexing the busiest keys if a table grows into the tens of thousands. | Open, optional. |
| F8 | Process | GitHub is suspended, so eleven commits (phases 5a–7b) exist only on this computer and in Vercel's deployments. The project folder also holds untracked PDFs, two zip files and a loose SQL file that must not be committed by accident, and `tsconfig.tsbuildinfo` shows as modified. | Open. Push when GitHub is restored; consider `.gitignore` entries for the stray files. |
| F9 | Info | Not load-tested. The functions were written set-based and indexed for classroom scale; month-end, analytics and the books check each scan a company's journal on every call. | Known limit. |

## 3. Advisor details (security and performance)

Security (4 grouped warnings): mutable search path on 5 Manufacturing helpers (F5); 17 definer functions executable by `anon` (16 are Standard, 1 is `guard_mfg_membership`); 140 definer functions executable by signed-in users (96 Manufacturing — by design, they are the application's API and each checks the caller's company, except the two in F4); leaked-password protection off (F6).
Performance (4 grouped): 148 unindexed foreign keys (84 Manufacturing), 18 initplan warnings (all Standard), 4 unused indexes (Manufacturing, expected on a nearly empty database), 215 multiple-permissive-policy notes (45 Manufacturing).

## 4. Reports — what exists and whether the numbers are right

Method: the demo company was loaded under standard and under actual costing, and the figures the Standard reports use were recomputed from the ledger.

| Report | Where | Checked |
|---|---|---|
| Trial balance | Reports | Debits = credits to the centavo, both costing methods |
| Balance sheet | Reports | Assets = liabilities + equity + net income, difference 0.00, both methods |
| Income statement, cash flow | Reports | Revenue 98,850 in both; expenses differ by costing method as expected. Applied labor and overhead appear as **negative expense lines** (accounts 5700–5720) — correct, but unfamiliar to students |
| Inventory valuation | Reports (Standard screen) | Equals the raw + packaging + finished-goods ledger accounts exactly (90,048.07 standard; 92,358.94 actual). **It leaves out work in process**, so it is smaller than the balance sheet's inventory plus WIP |
| A/R and A/P aging, spend by vendor, revenue by customer, payroll cost | Reports | Standard reports, unchanged; not re-tested here |
| Books check (stock vs. books) | Inventory → Stock vs. books | Ties in both methods; tolerates up to 10 centavos of rounding at month end |
| Statement of cost of goods manufactured, finished goods to cost of goods sold | Period End → Cost of goods manufactured | Three tie-outs to the production records at 0.00, both with and without prorated variances |
| Variance trend, profitability, inventory ABC, supplier scorecard, production KPIs, cost by lot size | Analytics | Every figure in the demo worked by hand and asserted in the phase 7b test |
| Class comparison | Compare (teacher) | Matches the ledger figures; flags a company whose books do not tie |
| OEE, dispatch list, MRP grid, exceptions, capacity, Gantt | Shop Floor, Planning | Asserted in the 5a/5b/6b tests |
| Export | List screens have CSV export; Standard reports have CSV export | **Period End statement, Analytics and Compare have no CSV or print option** |

Gaps worth knowing: no printable report pack for Manufacturing; the inventory valuation report omits WIP; no single "order cost report" screen apart from the panel on each production order.

## 5. Functional limitations already documented

MRP counts calendar days (not working days or holidays); month-end labor restatement covers only confirmations that name an employee; variance prorated into finished goods stays in that account; no finite-capacity scheduling, multi-currency, serial numbers or subcontracting; team companies with assigned roles are not built.

## 6. Recommended next steps, in order

1. Deploy the F1 fix (screens only, no migration).
2. Migration 0041: revoke client access to `mfg_order_wip`/`mfg_account`, fix the five search paths, revoke `guard_mfg_membership` from clients (F4, F5).
3. Add a shared query-error helper to the screens without one (F3).
4. A browser smoke test, or a saved script for the cross-check that found F1 (F2).
5. Turn on leaked-password protection (F6).
