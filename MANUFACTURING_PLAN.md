# JJ and Co. Manufacturing ERP — Phase 0 Plan

Status: **plan only, no code written.** Nothing here has been built or applied. Waiting for approval.

Written against the repo and the live Supabase project as of 2026-10-16 (commit `3d343a4`, migrations `0001`–`0022`).

---

## 0. Decisions I need from you (read this first)

The plan is built on these defaults. Each is "add new, don't change old." Say yes, or tell me what to change.

| # | Decision | My recommendation | Why |
|---|----------|-------------------|-----|
| D1 | How to mark a company's edition | New **side table** `tenant_editions(tenant_id, edition)`; no row = STANDARD | Touches **zero** existing tables. The spec's alternative is an `edition` column on `tenants`, which is also additive but changes a table that the teacher page, session and tenant-guard trigger all read. |
| D2 | Where manufacturing tables live | `public` schema with an **`mfg_` prefix** | A custom `mfg` schema is not reachable from supabase-js until it is added to *Settings → API → Exposed schemas* in the dashboard (a manual step that is easy to forget and silently breaks every screen). Prefix gives the same isolation with no dashboard step. |
| D3 | Existing files I would touch | **4 small edits** (§7.1) | The chooser has to sit between login and the app, and the Standard header needs a "switch ERP" link. That cannot be done without editing the redirect and the shell. |
| D4 | Companies per edition | **One Manufacturing company per student.** Standard keeps today's behaviour (a student may hold several Standard companies — the switcher shipped on 2026-10-10). | The brief says "one company in each edition"; but Standard multi-company already exists and students are using it. I will not remove it. |
| D5 | How Manufacturing reuses sales/purchasing | Reuse the **existing header documents, numbering, payments, banking, payroll, fixed assets, journals, recurring entries, period lock and approvals**. Add **new wrapper functions** for anything that moves *stock*. (§4) | The existing `post_bill` / `post_invoice` move a single global quantity per item and overwrite cost with last price. They cannot be reused for stocked items without editing them. |
| D6 | Who owns inventory quantities | Manufacturing keeps real stock in `mfg_stock` (by location/batch). `items.qty_on_hand` / `items.unit_cost` are kept as a **mirror** that Manufacturing functions maintain. | Standard screens (inventory list, global search, low-stock alert) keep working for a Manufacturing company without edits. |
| D7 | New dependency | Add **`zod`** (free). Skip server actions. | The repo has no zod and no server-side code at all: every page is a client component calling Supabase directly, with all posting in SQL functions. I will keep that pattern (§1.2). |
| D8 | Chart-of-accounts compatibility | Manufacturing chart **keeps the Standard codes** (1000, 1100, 1150, 1160, 1200, 2000, 2100–2130, 2200, 3000, 4000, 5000, 5100, 5300…) and adds new ones. New posting functions read accounts through the **determination table**, never by code. | The *reused* Standard functions look accounts up by hard-coded code (§1.5). Keeping those codes makes reuse safe. |
| D9 | Phase sizing | Split **Phase 4 (execution)** and **Phase 5 (planning)** each into two reviewable halves | They are the two largest; one review per half is safer than one giant one. |
| D10 | Approval of production orders | Reuse `tenants.approval_threshold` and `is_teacher()`; add a `PENDING_APPROVAL` state to production orders | Same rule students already know. |
| D11 | Costing-method switch | Teacher-only, only when no open production orders and the previous period is locked; logged | As specified. |

Questions I could not answer from the code are in §12.

---

## 1. What I found in the repo

### 1.1 Stack and facts that differ from the brief

| Brief says | Repo actually has |
|------------|-------------------|
| Next.js 14 | **Next.js 16.3.5**, React 19, Tailwind 3.4, TypeScript 5.5, recharts |
| zod, generated Supabase types | **Neither.** Types are hand-written in `src/lib/types.ts`; many rows are `any`. |
| Server actions / idempotent server code | **No server code at all.** No API routes, no middleware, no server actions. Every page is `"use client"`, calls `supabase-js` directly, and does all posting through SQL `security definer` functions. Idempotency today comes from status guards inside those functions and `disabled={submitting}` buttons. |
| Vercel + GitHub auto-deploy | Yes. A push to `main` auto-deploys (confirmed repeatedly). |
| Teacher enforced by a trigger | Yes: `handle_new_user` assigns `teacher` to one hard-coded email; `trg_guard_profile_role` blocks role changes; `is_teacher()` backs every RLS policy. |
| Currency ₱ | Yes (`money()` in `src/lib/types.ts`). |

**The Supabase project is shared with another app.** Tables `omr_profiles`, `omr_scan_records`, `omr_test_configs` belong to an unrelated OMR scanner. I will not read, change or reference them.

Database size today: **16 MB** of the free tier's 500 MB (638 journal entries, 125 items). There is ample room.

### 1.2 Pattern the whole app follows (I will follow it too)

- **Page** → `supabase.from(...)` for reads; `mutate(supabase.rpc(...))` for writes (`src/lib/mutate.ts` shows a toast on error).
- **Posting** → one `security definer` plpgsql function per business event; it calls `assert_tenant_access(tenant)` first (ownership check added 2026-10-08), then inserts documents + journal entries in one transaction.
- **Client writes to posted documents are blocked** by triggers that check `current_user in ('anon','authenticated')`; the functions run as owner and pass through.

### 1.3 Auth, companies and sessions

- Sign-up → `handle_new_user` trigger creates a `profiles` row (`student`, or `teacher` for the one email).
- `profiles.tenant_id` = the **active company**. `my_tenant_id()` returns it; **every RLS policy is `tenant_id = my_tenant_id() or is_teacher()`**.
- **Multi-company is already built** (migration `0021`): `memberships(user_id, tenant_id)`, RPCs `create_tenant`, `join_tenant`, `switch_tenant`, trigger `guard_profile_tenant` (a student can only point their profile at a company they belong to), a sidebar `CompanySwitcher` and a `/companies` page.
- **This is the foundation for editions.** A Manufacturing company is simply another tenant the student belongs to. Switching edition = switching active company. Data isolation between editions is therefore the same mechanism that already isolates companies.
- Routing today: `/` → `/login` (signed out), `/teacher` (teacher), `/dashboard` (student). `AppShell` wraps every signed-in page, redirects if no company, and renders the sidebar (`CompanySwitcher` for students).
- The teacher "views" a company by `viewTenantId` in `session.tsx`; the teacher's page lists all tenants with metrics.

### 1.4 Tables (public schema, live)

Accounting: `accounts` (`code`, `name`, `type`, `is_bank`; **no unique on tenant+code**), `journal_entries` (has `source_table`, `source_id`, `created_by`), `journal_lines`, `recurring_entries(+_lines)`, `bank_transactions`, `fixed_assets`, `depreciation_entries`.
Sales: `customers`, `quotes(+_lines)`, `sales_orders(+_lines)`, `invoices(+_lines)`, `invoice_payments`.
Purchasing: `vendors`, `purchase_orders(+_lines)`, `goods_receipts(+_lines)`, `bills(+_lines)`, `bill_payments`.
Stock: `items(sku, name, qty_on_hand, unit_cost, reorder_point)` — **no item type, UoM, location, batch or cost method**; no unique on sku or name.
People: `employees`, `time_entries(employee_id, work_date, hours_worked, notes)` — **not linked to any order or work center**, `leave_requests`, `employee_loans`, `payroll_runs`, `payroll_run_lines`.
Platform: `tenants(name, owner_id, books_locked_through, approval_threshold)`, `profiles`, `memberships`, `doc_counters(tenant_id, doc_type, next_number)`, `attachments`, `practice_reports`.

Everything tenant-scoped has `tenant_id … on delete cascade`, so deleting a tenant removes its rows. `delete_company` (teacher only) deletes journal entries explicitly first because journal rows are immutable.

### 1.5 The posting engine — what is reusable and what is not

Functions (all `security definer`, `search_path = public`, anon cannot execute):

| Function | Account codes it hard-codes | Stock behaviour |
|----------|----------------------------|-----------------|
| `post_invoice` | 1100, 4000, 5000, 1200, 2200 | Reads `invoice_lines.item_id`; **if an item is set** it adds `qty × items.unit_cost` to COGS and subtracts from `items.qty_on_hand`. **If `item_id` is null, it posts revenue/AR/VAT only.** Date = `invoices.order_date`. Approval threshold check inside. |
| `post_bill` | 1200, 2000, 1160 | **Matches lines to items by name**, adds qty, **overwrites `items.unit_cost` with the bill price**, debits **1200**. Approval threshold check inside. |
| `record_invoice_payment` / `record_bill_payment` | 1000, 1100 / 1000, 2000 | none |
| `void_invoice` / `void_bill` | as above | restores/removes stock by `item_id` / name |
| `run_payroll_ph`, `post_13th_month_pay`, `issue_employee_loan`, `cancel_employee_loan` | 5300, 5310, 5320, 2100–2130, 1000, 1150 | none |
| `record_depreciation` | 5400, 1590 | none |
| `post_recurring_entry`, `reverse_journal_entry` | caller-supplied accounts | none |
| `next_doc_number(tenant, type, prefix)` | — | **free-form type + prefix → I can reuse it unchanged for BOM-, PRD-, etc.** |

Guards that apply to *any* tenant automatically: `trg_period_lock` (blocks journal entries on or before `books_locked_through`), `trg_no_edit_je/jl` (journal immutability), `guard_document_write` (posted invoices/bills can't be edited by clients), payment-amount guards.

**Consequence for Manufacturing (important):** payments, banking, payroll, fixed assets, recurring entries, journals, period lock, numbering and approvals work for a Manufacturing company **as they are**. The stock-moving paths (`post_bill`, and `post_invoice` with an item) do **not** — they would double-count, ignore locations/batches, and break standard costing. So those get **new wrapper functions**, and I reuse the old ones only where they are safe (see §4).

### 1.6 Approvals, inventory, time

- **Approval:** `tenants.approval_threshold`; inside `post_invoice`/`post_bill` an over-threshold document goes to `pending_approval` for a non-teacher; the teacher approves by calling the same function. (Leave has its own trigger.) Nothing generic exists for other documents.
- **Inventory page:** CSV import, edit, delete-if-unreferenced, low-stock by `reorder_point`. Single quantity per item.
- **Time tracking:** hours per employee per date; hourly payroll sums them by month. No order link.

### 1.7 UI

`src/components/ui.tsx` (KpiCard, Panel, Modal, ConfirmDialog, buttons, StatusPill, SearchBox, FormStyles), `LineItemForm`, `DocActions`, `DatePrompt`, `DueDateField`, `CompanySwitcher`, `GlobalSearch`, `PaymentUI`, `CsvImport`, `Attachments`. Dark "ops console" theme as of 2026-10-08, driven by Tailwind tokens (`teal`, `gold`, `red`, `slate`, `hairline`, `panel`, `paper`). Pages are flat route folders (`/sales`, `/hr`, …), each wrapped in `AppShell`. No tables with resizable columns, tree tables, Gantt or saved variants exist yet — those are all new components.

### 1.8 Tests and tooling that exist

`npm test` = `node --test "tests/**/*.test.ts"` (21 tests: dates, lock scope, payroll, practice-set data). SQL integration tests are **rolled-back transactions** run through the Supabase SQL tool (`supabase/tests/integration_0021.sql`). There is no UI test runner, and I cannot sign in to the live app — so UI regression checks will be **click-through scripts you run** (§9.4).

---

## 2. Workspace chooser and edition design

### 2.1 Data (all new)

```
tenant_editions(tenant_id pk → tenants on delete cascade,
                edition text check in ('STANDARD','MANUFACTURING') not null,
                created_at)
edition_settings(edition pk, enabled boolean not null, updated_by, updated_at)
   -- seed: STANDARD enabled = true (cannot be disabled), MANUFACTURING enabled = false
mfg_company_settings(tenant_id pk → tenants,
                costing_method text check in ('STANDARD','ACTUAL'),
                fiscal_year_start date,
                variance_close_method text check in ('COGS','PRORATE') default 'COGS',
                oh_close_method text check in ('COGS','PRORATE') default 'COGS',
                explain_postings boolean default true,
                created_at)
edition_last_used(user_id, edition, tenant_id, opened_at, pk(user_id, edition))
```

Helper `tenant_edition(tid)` returns `'STANDARD'` when no row exists, so **every existing company is Standard with no data change**.

### 2.2 Flow

1. Login → `/` → **`/choose`** (new). Teacher still goes to `/teacher`.
2. `/choose` shows two cards. Standard card → student's most recent Standard company (existing switcher still lets them pick another). Manufacturing card → their one Manufacturing company, or "Set up".
3. Clicking a card calls the **existing `switch_tenant`** to that company, records `edition_last_used`, then routes to `/dashboard` (Standard) or `/mfg` (Manufacturing).
4. First Manufacturing open → **setup wizard** → RPC `create_mfg_company(name, fiscal_year_start, costing_method, load_demo)`: creates the tenant, a membership, `tenant_editions` row, `mfg_company_settings`, the seeded manufacturing chart and account determination, and sets it active. One per student (partial unique index on owner + edition).
5. Header edition switcher on **both** shells: badge (Standard = cyan, Manufacturing = amber) + "Switch ERP" → `/choose`.
6. Standard pages and Manufacturing pages each **check the active company's edition**; a mismatch shows a "wrong ERP — switch" screen instead of the page (UI guard, see §3 for the database side).
7. "Remember last edition, still show chooser after each login": `/choose` highlights the last used card with a "Continue" button; it does not auto-skip.

### 2.3 Teacher

- Teacher page gets an **edition filter** (Standard / Manufacturing / All).
- `edition_settings` toggle: **only `is_teacher()` can update**; students cannot enable Manufacturing for themselves. While disabled, the Manufacturing card on `/choose` is greyed out ("Opens when your teacher enables it"), and `create_mfg_company` refuses.
- Teacher can change a student's `costing_method` (D11 rules). A student cannot (trigger, same pattern as `guard_tenant_update`).

---

## 3. Isolation rules — how the Standard ERP stays untouched

1. **No existing table is altered** (D1). No existing column, trigger, function or policy is dropped, renamed or changed.
2. **All Manufacturing data in `mfg_*` tables**, each with `tenant_id … on delete cascade`, RLS = `tenant_id = my_tenant_id() or is_teacher()` **and** `tenant_edition(tenant_id) = 'MANUFACTURING'` (a student cannot read or write `mfg_*` rows for a Standard company even if they belong to it).
3. **All Manufacturing functions begin with** `assert_tenant_access(tenant)` **and** `assert_mfg_tenant(tenant)` (raises if the company is not a Manufacturing one).
4. **Standard company inside Manufacturing screens / vice versa:** blocked in the UI by the edition guard and, for Manufacturing data, in the database by (2) and (3). The reverse direction — a Standard *screen* writing into a Manufacturing company's shared tables — is **not** blocked by the database, because that would require editing existing triggers. It is blocked in the UI only. (Open question Q1.)
5. **Deleting a company** works without changing `delete_company`: mfg tables cascade from `tenants`; links to `journal_entries` use `on delete set null`, so the explicit journal delete does not fail.
6. **Regression harness per phase:** a rolled-back SQL script that runs the Standard flows (journal entry, quote→SO→invoice→payment, PO→GR→bill→payment, payroll run, void, reports queries) against a Standard company and asserts the **exact same totals** as a stored baseline; plus the existing 21 unit tests; plus a click-through script for you.

---

## 4. Reuse matrix — Standard engines used by Manufacturing

| Standard capability | Manufacturing treatment | New objects needed |
|---------------------|------------------------|--------------------|
| Chart of accounts screen/table | **Reuse as is** (`accounts`). Seeded with manufacturing accounts. | `create_mfg_company` (seeds accounts) |
| Journal entries, reversal, immutability, **period lock**, audit trail | **Reuse as is** | — |
| Document numbering | **Reuse `next_doc_number`** with new types/prefixes | numbering triggers on `mfg_*` tables |
| Banking, reconciliation, multi-bank | **Reuse as is** | — |
| Fixed assets / depreciation | **Reuse as is** | — |
| Recurring entries | **Reuse as is** | — |
| Payroll (SSS/PhilHealth/Pag-IBIG/BIR), loans, leave, time | **Reuse as is.** Wages post to 5300 as today; direct labor is *absorbed* separately in confirmations (§6) | link table `mfg_confirmation_time` (optional link to a `time_entries` row) |
| Global search, attachments, CSV import | **Reuse components** | extra search sources |
| Customers, vendors | **Reuse tables** | — |
| Quotes, sales orders, purchase orders (document headers/lines) | **Reuse tables.** Lines gain an item link through `mfg_po_line_item` / `mfg_so_line_item` (`line_id → item_id, uom, location`) because existing PO lines carry only a description. | link tables + a Manufacturing form |
| **Goods receipt (stock + GL)** | **New.** Existing `goods_receipts` is a paper record with no posting. `mfg_post_goods_receipt` writes a `goods_receipts` row (reuses GR- numbering), a material document, stock, and the GL entry (Dr RM / Cr GR-IR). | `mfg_post_goods_receipt` |
| **Vendor invoice → AP** | **New wrapper** `mfg_post_vendor_invoice`: clears GR/IR, posts price variance and input VAT, and **inserts a `bills` row as owner** with status `received`, so **`record_bill_payment`, AP aging, bank matching all work unchanged**. It does **not** call `post_bill` (which would debit 1200 again). | `mfg_post_vendor_invoice` |
| **Sales delivery (stock + COGS)** | **New** `mfg_post_delivery`: issues from FG, Dr COGS / Cr FG at the item's costing-method cost. | `mfg_post_delivery` |
| **Sales invoice (AR/revenue/VAT)** | **Reuse `post_invoice`** with invoice lines whose `item_id` is **null** → it posts revenue/AR/VAT only and leaves stock and COGS to the delivery. Payments reuse `record_invoice_payment`. | Manufacturing invoice form (no `item_id`) |
| Approval threshold | **Reuse `tenants.approval_threshold`.** `post_invoice` already handles invoices; production-order release gets its own check against the same threshold. | `PENDING_APPROVAL` state |
| Void | `void_invoice` reused for revenue side; deliveries are reversed by `mfg_reverse_delivery` | reversal functions |
| Student Inventory page | Not used by Manufacturing. Still safe: it reads the mirrored `items` row. | mirror upkeep inside every stock function |

Nothing in the first column is edited.

---

## 5. Data model

Naming: all in `public`, prefix `mfg_`. Every table: `id uuid pk default gen_random_uuid()`, `tenant_id uuid not null → tenants on delete cascade`, `created_at`, `created_by`. Quantities `numeric(18,4)`, amounts `numeric(18,2)`, unit costs `numeric(18,6)`.

### 5.1 Setup (Phase 1) — see §2.1, plus
`mfg_account_determination(tenant_id, key, account_id, pk(tenant_id,key))` — keys listed in §6.1.

### 5.2 Master data (Phase 2)
- `mfg_uom(code, name)`, `mfg_uom_conversions(item_id?, from_uom, to_uom, factor)`.
- `mfg_item_master(item_id pk → items, item_type [RAW,SEMI,FINISHED,PACKAGING,SERVICE], make_or_buy, base_uom, procurement_lead_days, production_lead_days, lot_rule [LOT_FOR_LOT,FIXED,EOQ,MIN_MAX,PERIODIC], lot_size, min_lot, max_lot, safety_stock, scrap_pct, batch_tracked, low_level_code, standard_cost, price_unit, moving_avg_cost, cost_version)`.
- `mfg_storage_locations(code, name, kind [RM,WIP,FG,QUARANTINE])`.
- `mfg_batches(item_id, batch_no, created_on, expiry?)`.
- `mfg_stock(item_id, location_id, batch_id?, qty, unique(item,location,batch))` with `check qty >= 0` configurable (negative stock off by default).
- `mfg_boms(item_id, version, alt_no, base_qty, valid_from, valid_to, status [DRAFT,ACTIVE,OBSOLETE])`, `mfg_bom_items(bom_id, line_no, component_item_id, qty, uom, scrap_pct, is_phantom, kind [COMPONENT,COPRODUCT,BYPRODUCT], cost_share_pct)`. A **trigger rejects any BOM edge that would create a cycle** (recursive CTE check on insert/update). Low-level codes recomputed by function `mfg_recalc_low_level(tenant)`.
- `mfg_cost_centers`, `mfg_work_centers(code, name, cost_center_id, capacity_hours_per_day, shifts, utilization_pct, efficiency_pct, calendar jsonb)`, `mfg_activity_types(code, kind [LABOR,MACHINE,SETUP])`, `mfg_activity_rates(work_center_id, activity_type_id, period_start, rate)`.
- `mfg_routings(item_id, version, status)`, `mfg_routing_ops(routing_id, op_no, work_center_id, setup_min, run_min_per_unit, teardown_min, queue_min, move_min, control_key, component_line_nos int[])`.
- `mfg_costing_sheet(tenant_id, base [MATERIAL,LABOR,BOTH], oh_pct, oh_rate_per_hour, kind [VARIABLE,FIXED])`.

### 5.3 Costing (Phase 3)
`mfg_cost_estimates(CE-, item_id, bom_id, routing_id, lot_size, status [DRAFT,MARKED,RELEASED,SUPERSEDED], total_cost, unit_cost)`, `mfg_cost_estimate_lines(estimate_id, level, component_item_id?, element [MATERIAL,LABOR,MACHINE,VAR_OH,FIX_OH], qty, rate, amount)`.

### 5.4 Execution (Phase 4)
- `mfg_production_orders(PRD-, item_id, qty_planned, qty_good, qty_scrap, status, bom_snapshot jsonb, routing_snapshot jsonb, planned_start, planned_end, release_approved_by, costing_method, ...)`, `mfg_prod_components(order_id, item_id, qty_required, qty_issued, location_id, backflush)`, `mfg_prod_operations(order_id, op_no, work_center_id, qty_confirmed, hours_planned, hours_actual)`.
- `mfg_material_documents(MI-/FGR-/GR-/GI-, type, posting_date, reversal_of?, journal_entry_id → journal_entries on delete set null, idempotency_key unique)` + `mfg_material_doc_lines(doc_id, item_id, location_id, batch_id, qty, unit_cost, amount, direction)`.
- `mfg_confirmations(CNF-, order_id, op_no, yield_qty, scrap_qty, scrap_reason, rework_qty, setup_h, labor_h, machine_h, employee_id?, is_final, reversal_of?, journal_entry_id)`.
- `mfg_order_cost_lines(order_id, element, planned, target, actual)` (refreshed by the settle/report functions).
- `mfg_settlements(SET-, order_id, journal_entry_id, variance breakdown columns)`.

### 5.5 Planning (Phase 5)
`mfg_forecasts(item_id, period_start, qty)`, `mfg_mrp_runs(MRP-, started_at, finished_at, status, params)`, `mfg_planned_orders(PLN-, item_id, qty, start, finish, source [MRP,MANUAL], status [OPEN,CONVERTED,DELETED], converted_to_id)`, `mfg_purchase_reqs(item_id, qty, need_date, status)`, `mfg_mrp_exceptions(run_id, item_id, kind, message)`, `mfg_pegging(planned_id, demand_kind, demand_id, qty)`.

### 5.6 Quality (Phase 6)
`mfg_inspection_plans(item_id, characteristic, spec_min, spec_max)`, `mfg_inspection_lots(QI-, source [GR,PRODUCTION], source_id, status [CREATED,IN_INSPECTION,DECIDED], decision [ACCEPT,SCRAP,RETURN,REWORK], qty)`, `mfg_inspection_results(lot_id, characteristic, value)`, `mfg_ncr(NCR-, lot_id, root_cause, disposition, cost)`.

### 5.7 Indexes, constraints, RLS
- Index every FK and `(tenant_id, status)`, `(tenant_id, item_id)`, `(tenant_id, created_at)`.
- RLS on every `mfg_*` table as in §3.2; **writes only via functions** for anything that carries money or stock (no insert/update policy on `mfg_material_documents`, `mfg_confirmations`, `mfg_settlements`, `mfg_stock`; master-data tables allow client writes for the owning company).
- Status transitions enforced by `check` constraints plus a `mfg_*_transition()` function; posted documents are never updated, only reversed.

---

## 6. Account determination and the General Ledger

### 6.1 Determination keys (per company, seeded, editable only by teacher)
`RM_INVENTORY`, `WIP`, `FG_INVENTORY`, `PACKAGING_INVENTORY`, `GR_IR`, `PPV`, `APPLIED_LABOR`, `APPLIED_MACHINE`, `APPLIED_FIXED_OH`, `MATERIAL_USAGE_VAR`, `LABOR_EFF_VAR`, `LABOR_RATE_VAR`, `MACHINE_OH_VAR`, `FIXED_OH_VAR`, `SCRAP_VAR`, `LOT_SIZE_VAR`, `MIX_VAR`, `REVALUATION`, `ROUNDING`, `COGS`, `SCRAP_LOSS`, `COPQ`, `PAYROLL_EXPENSE`.

### 6.2 Manufacturing chart of accounts (seeded)
Standard codes kept (so reused functions work): 1000 Cash · 1100 AR · 1150 Employee Loans · 1160 Input VAT · **1200 Raw Materials Inventory** · 1500 Fixed Assets · 1590 Accum. Depreciation · 2000 AP · 2100–2130 statutory payables · 2200 VAT Payable · 3000 Equity · 4000 Sales · 5000 COGS · 5100 Opex · 5200 Marketing · 5300 Payroll Expense · 5310 · 5320 · 5400 Depreciation.
**New:** 1210 WIP · 1220 Finished Goods · 1230 Packaging & Supplies · 2050 GR/IR Clearing · 4100 By-product & Scrap Sales · 5500 Purchase Price Variance · 5510 Material Usage Variance · 5520 Labor Efficiency Variance · 5530 Labor Rate Variance · 5540 Machine/Variable OH Variance · 5550 Fixed OH Volume Variance · 5560 Scrap & Rework Loss · 5570 Lot-size / Mix Variance · 5580 Inventory Revaluation · 5590 Rounding Differences · 5600 Cost of Poor Quality · 5700 Applied Direct Labor (credit) · 5710 Applied Machine OH (credit) · 5720 Applied Fixed OH (credit).

### 6.3 One worked example, used for every posting below
**Dining Chair**, standard cost per unit **₱468**: lumber 3 bd-ft @ ₱60 = 180 · screws 8 @ ₱1 = 8 · varnish 0.2 L @ ₱250 = 50 (**material 238**) · labor 1.5 h @ ₱80 = 120 · machine 0.5 h @ ₱100 = 50 · fixed OH ₱40 per labor hour × 1.5 = 60.
**Order PRD-0001: 100 chairs.** Target ₱46,800. **Actual:** lumber 310 bd-ft, screws 800, varnish 20 L, labor 160 h, machine 52 h, **98 good + 2 scrap**. VAT 12%.

### 6.4 Postings — Standard costing (every one is a single transactional function, balanced, dated)

| Event (function) | Debit | Credit | Example |
|------------------|-------|--------|---------|
| Goods receipt `mfg_post_goods_receipt` — 200 bd-ft lumber, PO price ₱65, std ₱60 | 1200 RM Inventory 12,000 · 5500 PPV 1,000 | 2050 GR/IR 13,000 | PPV = (65−60)×200 |
| Vendor invoice `mfg_post_vendor_invoice` — same lot, invoice at PO price, 12% VAT | 2050 GR/IR 13,000 · 1160 Input VAT 1,560 | 2000 AP 14,560 | creates `bills` row (status received) for payments |
| Invoice price ≠ PO price (e.g. ₱66) | 2050 GR/IR 13,000 · 5500 PPV 200 · 1160 Input VAT 1,584 | 2000 AP 14,784 | invoice variance goes to PPV |
| Material issue `mfg_post_material_issue` — 310 / 800 / 20 at **standard price × actual qty** | 1210 WIP 24,400 | 1200 RM 24,400 | 18,600 + 800 + 5,000 |
| Confirmation `mfg_post_confirmation` — labor 160 h | 1210 WIP 12,800 | 5700 Applied Direct Labor 12,800 | 160 h × ₱80 |
| Confirmation — machine 52 h | 1210 WIP 5,200 | 5710 Applied Machine OH 5,200 | 52 h × ₱100 |
| Confirmation — fixed OH | 1210 WIP 6,400 | 5720 Applied Fixed OH 6,400 | 160 h × ₱40 |
| FG receipt `mfg_post_fg_receipt` — 98 good × ₱468 | 1220 FG 45,864 | 1210 WIP 45,864 | scrap does not receive stock |
| TECO settlement `mfg_settle_order` — WIP left 48,800 − 45,864 = 2,936 | 5510 Material Usage Var 1,076 · 5520 Labor Efficiency Var 1,040 · 5540 Machine OH Var 300 · 5550 Fixed OH Var 520 | 1210 WIP 2,936 | each = actual − target for 98 units (material 24,400 − 23,324, etc.); the scrap-driven part of material is shown as a memo (2 units × 238 = 476) |
| Delivery `mfg_post_delivery` — 50 chairs | 5000 COGS 23,400 | 1220 FG 23,400 | 50 × 468 |
| Sales invoice (**existing `post_invoice`**, `item_id` null) — 50 × ₱1,000 + 12% | 1100 AR 56,000 | 4000 Sales 50,000 · 2200 VAT Payable 6,000 | no COGS here — delivery did it |
| Standard release with stock `mfg_release_cost_estimate` — lumber 60→62, 400 bd-ft on hand | 1200 RM 800 | 5580 Revaluation 800 | 400 × 2 |
| Period-end labor rate `mfg_close_period` — actual DL wages 160 × ₱82 = 13,120 vs applied 12,800 | 5700 Applied Direct Labor 12,800 · 5530 Labor Rate Var 320 | 5300 Payroll Expense 13,120 | wages came from the existing payroll run |
| Period-end variance close (method COGS) — PPV 1,000 + 1,076 + 1,040 + 300 + 520 + 320 = **4,256** | 5000 COGS 4,256 | 5500 1,000 · 5510 1,076 · 5520 1,040 · 5540 300 · 5550 520 · 5530 320 | **PRORATE** option splits the 4,256 across WIP / FG / COGS in proportion to period-end balances instead |
| Scrap disposal (NCR → scrap) — 2 chairs at 468 | 5560 Scrap & Rework Loss 936 | 1220 FG 936 | if scrapped from stock |
| Co-/by-product receipt | 1220 FG (share %) | 1210 WIP | cost split by `cost_share_pct`; by-product sales go to 4100 |

### 6.5 Postings — Actual costing
Same order. Receipts and invoices post at **actual** price (no PPV account used); lumber moving average = (100 on hand × ₱60 + 200 × ₱65) ÷ 300 = **₱63.333333**.

| Event | Debit | Credit | Example |
|-------|-------|--------|---------|
| Material issue at moving average — 300 bd-ft + 800 screws + 20 L | 1210 WIP 24,800 | 1200 RM 24,800 | 19,000 + 800 + 5,000 (rounding to 5590) |
| Labor at actual — 160 h × actual avg rate ₱82 (rate from the employee/time link) | 1210 WIP 13,120 | 5700 Applied Direct Labor 13,120 | |
| Machine + overhead at predetermined rates | 1210 WIP 11,600 | 5710 5,200 · 5720 6,400 | |
| FG receipt at **actual accumulated cost** — 98 good | 1220 FG 49,520 | 1210 WIP 49,520 | unit cost 49,520 ÷ 98 = **₱505.306122**; WIP cleared to zero, so no settlement variances |
| Period-end applied-vs-actual labor and OH | as §6.4 period-end, to over/under-applied | | closed to COGS or prorated |

### 6.6 Statement of Cost of Goods Manufactured (both methods)
`RM beginning + purchases − RM ending = RM used` · `+ direct labor + overhead applied = total manufacturing cost` · `+ WIP beginning − WIP ending = COGM` · `→ COGS`. Built **from the ledger** (account balances by period) and **cross-checked against the material and confirmation documents**. A test asserts the two agree.

### 6.7 "Show journal entry" panel
Every posting screen renders the exact lines the function *would* post (`mfg_preview_*` functions, read-only, same code path as posting) with a plain-language sentence per line. Teacher can switch it off per company (`explain_postings`).

---

## 7. What I would touch outside the new code

### 7.1 Existing files (D3) — each tiny, each needs your OK

| File | Change | Why it cannot be avoided |
|------|--------|--------------------------|
| `src/app/page.tsx` | Student redirect `/dashboard` → `/choose` | The chooser must sit between login and the app. |
| `src/app/login/page.tsx` | After sign-in, `router.replace("/dashboard")` → `/choose` (two places) | Same reason. |
| `src/components/AppShell.tsx` | Add an **edition badge + "Switch ERP"** link, and the "wrong ERP" guard | The Standard shell is the only place to put the header switcher. |
| `src/app/teacher/page.tsx` | Add the **edition filter** chips | Brief asks for it on the teacher dashboard. (Alternative: a separate `/mfg/teacher` page and no edit here — say if you prefer that.) |

Not touched: `session.tsx` (the existing `switchCompany` is enough), `types.ts`, `mutate.ts`, every other page, Tailwind config, `globals.css`. The Manufacturing layout sets its accent colour with a local CSS variable.

### 7.2 Existing tables
**None altered** (D1). New objects only.

### 7.3 Existing functions/triggers/policies
**None altered.** `delete_company` already works (§3.5). The Manufacturing chart is created by a **new** `create_mfg_company`, which duplicates the 22-account seed rather than editing `create_tenant`.

### 7.4 New runtime dependency
`zod` (D7). Optional: Supabase types via a generated file `src/lib/database.types.ts` (generated with the Supabase tool, never hand-edited).

---

## 8. Status machines

- **Production order:** `CREATED → (PENDING_APPROVAL →) RELEASED → PARTIALLY_CONFIRMED → CONFIRMED → DELIVERED → TECHNICALLY_COMPLETE → CLOSED`; side states `LOCKED`, `CANCELLED` (only before any posting). Release runs component + capacity availability checks, freezes the BOM/routing snapshot, and (above the threshold) routes to the teacher. TECO runs settlement. CLOSED requires zero WIP.
- **Planned order:** `OPEN → CONVERTED | DELETED`. **MRP run:** `RUNNING → DONE | FAILED`.
- **BOM / routing:** `DRAFT → ACTIVE → OBSOLETE` (one ACTIVE per item/alt/valid date).
- **Cost estimate:** `DRAFT → MARKED → RELEASED → SUPERSEDED`.
- **Inspection lot:** `CREATED → IN_INSPECTION → DECIDED(accept | scrap | return | rework)`; quarantine stock moves only on the decision.
- **Period:** `OPEN → SETTLED → CLOSED` (CLOSED sets `books_locked_through`, reusing the existing lock).
- **Material documents / confirmations / settlements:** immutable; reversal creates a linked reversing document.

---

## 9. Screens, navigation and quality bar

### 9.1 Navigation (Manufacturing layout `/mfg/...`)
Overview · Finance · Sales · Purchasing · Inventory · Master Data · Planning · Production · Shop Floor · Quality · Costing · Payroll · Reports. Finance, Sales, Purchasing, Inventory (stock lists), Payroll reuse the existing components against the active Manufacturing company, re-skinned with the amber edition accent and badge.

### 9.2 New UI components (all new files)
List Report (filter bar, saved variants in `localStorage`, sortable/resizable columns, column chooser, bulk actions, CSV export), Object Page (header facts, KPI tiles, tabs, status-aware toolbar), tree table (BOM / cost roll-up), time-phased MRP grid, capacity Gantt (own SVG; no new chart dependency), document-flow panel, journal-entry preview panel, edition badge, workspace chooser, setup wizard, period-end wizard.

### 9.3 Quality bar
- **Unit tests** (`node --test`): cost roll-up, MRP netting + lot sizing (all five rules), variance splitting (the §6.4 numbers are the first test), moving average, BOM cycle detection, low-level codes.
- **SQL tests** (rolled-back, saved under `supabase/tests/`): every posting function produces **balanced** entries; the §6.4 and §6.5 scenarios end-to-end per costing method (demo → MRP → release → issue → confirm → receive → settle → sell → close), asserting **trial balance balances** and **COGM ties to the GL**.
- **RLS tests:** student A cannot see student B's company; a Standard company is unreadable from `mfg_*` and Manufacturing functions refuse it; only the teacher can enable the edition, approve, or change costing; anon sees nothing.
- **Performance:** index every FK; run `explain analyze` on MRP and the reports at demo size and at 10× (target: MRP well under the PostgREST statement limit for the `authenticated` role — I will check the actual limit on this project before Phase 5).
- No secrets in code; each migration has rollback notes in its header.

### 9.4 Per-phase regression check on the Standard ERP
1. **Automated (I run):** existing 21 unit tests + a rolled-back SQL baseline for journal entry, quote→SO→invoice→payment, PO→GR→bill→payment, payroll, void, plus a diff of all existing public function definitions and table columns before/after the migration (must be identical).
2. **Click-through (you run, ~10 minutes):** a script I write each phase.
3. **What I cannot do:** drive the signed-in UI myself — I do not sign in to your app. I will say plainly in each report which checks were automated and which are yours.

---

## 10. Migration list (continuing the existing numbering)

| # | File | Phase | Contents |
|---|------|-------|----------|
| 0023 | `mfg_editions.sql` | 1 | `tenant_editions`, `edition_settings`, `mfg_company_settings`, `edition_last_used`, `tenant_edition()`, `assert_mfg_tenant()`, RLS, guards |
| 0024 | `mfg_company_setup.sql` | 1 | manufacturing chart seed, `mfg_account_determination`, `create_mfg_company`, `set_edition_enabled`, one-company-per-student index |
| 0025 | `mfg_master_data.sql` | 2 | UoM, item master, locations, batches, stock, BOMs (+cycle trigger), work centers, routings, cost centers, rates, numbering triggers |
| 0026 | `mfg_link_tables.sql` | 2 | PO/SO line item links, time-entry link |
| 0027 | `mfg_costing.sql` | 3 | estimates, roll-up, mark/release, revaluation, moving average |
| 0028 | `mfg_stock_documents.sql` | 4a | material documents, stock functions, goods receipt, vendor invoice, delivery |
| 0029 | `mfg_production.sql` | 4a | production orders, release, issue, confirmation, FG receipt |
| 0030 | `mfg_settlement.sql` | 4b | settlement, variance split, order cost report, reversals |
| 0031 | `mfg_planning.sql` | 5a | forecasts, MRP function, planned orders, exceptions, pegging |
| 0032 | `mfg_capacity.sql` | 5b | capacity load, scheduling, conversion functions |
| 0033 | `mfg_quality.sql` | 6 | inspection plans/lots, NCR, shop-floor dispatch, OEE capture |
| 0034 | `mfg_period_close.sql` | 7 | period-end wizard functions, COGM, variance close |
| 0035 | `mfg_demo_scenario.sql` | 7 | demo loader (Nueva Ecija wooden-furniture shop) |

**Rollback:** each file starts with a comment block listing the exact `drop` statements that undo it (they only drop objects that file created, so rolling back can never touch Standard objects). Because Standard objects are never altered, rollback is always safe.
**Confirming a migration ran:** after each one I will give you an `information_schema` / `pg_proc` query and the exact result to expect — I will not assume a file that exists has run.

---

## 11. Phases (stop for review after each)

1. **Phase 1 — Chooser + editions.** `/choose`, header switch, wizard, chart seed, teacher toggle/filter, RLS, core modules running for a Manufacturing company (journal, sales documents, payments, banking, payroll, fixed assets). Standard regression.
2. **Phase 2 — Master data + determination.**
3. **Phase 3 — Costing engine.**
4. **Phase 4a — Stock documents + production through FG receipt. 4b — Settlement, variances, reversals, order cost report.**
5. **Phase 5a — MPS/MRP + exceptions + pegging. 5b — Capacity, Gantt, conversions.**
6. **Phase 6 — Quality, dispatch list, OEE.**
7. **Phase 7 — Analytics, period-end, teacher comparison, demo loader.**

Each phase report: what was built/deviations · migrations in order · test results incl. Standard regression · browser click-through script with expected journal entries · beginner-friendly deployment steps (exact commands, what you should see, how to apply the migration in Supabase and confirm via `information_schema`).

---

## 12. Risks and open questions

**Q1 — Database-level separation in one direction.** A Standard *screen* could in principle write into a Manufacturing company's shared tables (e.g. a student opens `/sales` while a Manufacturing company is active). I block it in the UI only, because a database block needs a trigger on existing tables (`invoices`, `bills`, …). The risk is low (students would have to bypass the page guard) but it is not zero. Do you want me to add an additive trigger on those tables? It is a change to existing tables, so I will only do it if you say yes.

**Q2 — Existing `items` rows and duplicates.** `items` has no unique key on sku or name, and the Standard bill posting matches by *name*. The Manufacturing item master will enforce unique `(tenant, sku)` in `mfg_item_master`, not in `items`. A Manufacturing student must create items through Manufacturing screens, not the Standard Inventory page.

**Q3 — Free-tier limits.** `authenticated` requests have a statement timeout (I will read the project's actual value in Phase 5; the Supabase default is 8 s). MRP at classroom scale (a few hundred items, 3-level BOMs) is well inside it, but I will implement MRP **set-based by low-level code** and batch it, with a run log, so it degrades gracefully instead of failing.

**Q4 — Idempotency without server actions.** Posting functions take an optional `idempotency_key`; a second call with the same key returns the first result and posts nothing. Combined with the status guards and disabled buttons, this covers double clicks. If you specifically want Next.js server actions, that is a new architecture layer — tell me.

**Q5 — Labor rates for actual costing.** The app has no per-employee cost rate other than `employees.hourly_rate` / `salary ÷ 12 ÷ 173.33`. Actual-costing labor will use that, per employee, via the optional confirmation→employee link. Manufacturing-specific rates can be added to the work-center activity rates if you prefer.

**Q6 — Negative stock.** Default: refuse. A company setting can allow it for teaching ("what happens when you issue stock you haven't received").

**Q7 — Approval scope.** The existing approval mechanism is not generic; production-order release approval is new code that merely reuses the threshold and `is_teacher()`. Are other Manufacturing documents (planned-order conversion, settlement, period close) to be approval-gated too?

**Q8 — Fiscal year start.** The existing app has no fiscal-year concept (only the lock date). Manufacturing periods will be calendar months from the wizard's `fiscal_year_start`. Standard reports are untouched.

**Q9 — Practice sets and the checker.** The Standard "Check" tool and the two practice sets are Standard-only. I will not alter them. A Manufacturing practice set + checker would be a separate follow-up if you want one.

**Q10 — Effort.** This is a large build (it is close to the size of the whole existing app). I would rather ship each phase small and verified than rush. Phase 1 alone is roughly the chooser, wizard, ~4 tables, ~3 functions, RLS and the regression harness.

**Deferred / not in scope unless you ask:** PP/DS finite-capacity optimisation (planning is infinite-capacity MRP with a capacity *check*, as in SAP's standard MRP + CM01), multi-currency, serial numbers, subcontracting, and real-time shop-floor hardware integration. I will not build stubs for any of these.

---

**Next step:** approve (or amend) D1–D11 and Q1, Q4, Q7. Then I start Phase 1 and stop after it.

---

## Phase 2 as built (deviations from the plan above)

- **Migrations:** `0025_mfg_master_data.sql` (units, conversions, locations, item master, cost/work centers, calendar, activity types and rates, costing sheet, BOM and routing tables, seeding, item functions, account-determination editing) and `0026_mfg_bom_routing_engine.sql` (cycle trigger, low-level codes, BOM and routing lifecycle functions, explosion, where-used, comparison, routing load, calendar hours). The earlier plan reserved 0026 for the PO/SO link tables; those move to Phase 4a together with `mfg_stock` and `mfg_batches`, which are not needed until stock moves.
- **Scrap** is `net × (1 + scrap %)` on the BOM line. The item-level scrap % is stored for planning (Phase 5) and is not applied by the explosion.
- **Only COMPONENT lines are requirements.** Co-product and by-product lines are outputs; their cost shares are validated (total ≤ 100 %) and used from Phase 3.
- **Activation** closes an older active version the day before a later-starting one; any other overlap is refused. Routings keep exactly one active version per item and alternative.
- **Master tables** that need no business rules (units, locations, work centers, cost centers, calendar, rates, costing sheet) are written directly by the owning student under row-level security; items, BOMs and routings are written only through functions.
- **Teacher** reads every table, edits none, and is the only one who can change the account determination (`mfg_set_account`, audit-logged, account type checked).

---

## Phase 3 as built (deviations from the plan above)

- **Migrations:** `0027_mfg_joinable_companies.sql` (the join-list function) and `0028_mfg_costing.sql` (costing). This moves the later plan numbers up by one: stock documents become 0029, production 0030, settlement 0031, planning 0032, capacity 0033, quality 0034, period close 0035, demo scenario 0036.
- **Join list:** Manufacturing companies are hidden from the join lists (`/companies` and the first-login picker) through `joinable_companies()`; a student cannot see other companies' edition rows, so this has to be a database function.
- **Routing times:** operations gained optional labor and machine minutes per unit (both blank = the run time is all labor), so labor and machine hours can differ as in the worked example (1.5 h labor, 0.5 h machine).
- **Costing sheet:** each row says which hours its per-hour rate counts (labor or machine); the seeded fixed-overhead row counts labor hours.
- **Planned price** and a **price unit** (e.g. ₱50 per 100 nails) on the item master; the standard cost is written only by releasing an estimate. `moving_avg_cost` exists now and is used from Phase 4 (actual costing).
- **Roll-up rules:** material at planned price × quantity (BOM scrap included); an item's own scrap % raises the quantity started (good ÷ (1 − scrap %)); setup and teardown are charged once per lot (SETUP rate, or the labor rate if there is none); overhead on material or labor uses that item's own level only; a phantom is looked straight through; co-/by-products take their cost-share % of the lot.
- **Release** revalues stock on hand from `items.qty_on_hand` (the Standard-side mirror that Phase 4 keeps in step with Manufacturing stock) with one entry: inventory accounts against 5580 Inventory Revaluation, and mirrors the new cost into `items.unit_cost`.
- **Deferred:** a lot-size sensitivity curve (cost by lot size) moves to the Phase 7 analytics screens; estimates under actual costing are planning-only.

---

## Roadmap after reconciliation (2026-10-16)

See `MANUFACTURING_RECONCILIATION.md`. Approved changes to the phase list: a **pre-4a** step (yield fix, database balance trigger, control-account guard), a new **Phase 4c** (vendor invoice with three-way match, landed cost, AP), and **Phase 6b** (team companies with assigned roles, after Phase 6). Phases 4a/4b/5/6/7 otherwise as listed in section 11.

---

## Phase 4a as built (deviations from the plan above)

- **Migrations:** `0029_mfg_guards_and_yield.sql` (before 4a: one quantity rule, the database balance check, the control-account guard), `0030_mfg_stock_kernel.sql` (posting function, immutable stock documents, stock, lots, purchase orders, goods receipt, adjustments, transfers) and `0031_mfg_production.sql` (production orders to finished-goods receipt, reconciliation). Later phases keep shifting up: settlement 0032, vendor invoice with three-way match and landed cost 0033 (Phase 4c), planning 0034, capacity 0035, quality 0036, period close 0037, demo 0038.
- **Quantity rule:** one rule for the BOM explosion, the cost estimate and the production order: start = good ÷ (1 − item scrap %) ÷ (recipe yield %), line scrap on top. A recipe-level `yield_pct` was added to bills of materials.
- **Balance check (Q-A):** a deferred constraint trigger on `journal_lines` refuses an entry whose debits and credits differ by half a centavo or more (not exactly zero: amounts sent from the browser can carry floating-point dust). Manufacturing postings go through `mfg__post_entry`, which is exact to the centavo and sends differences of up to 5 centavos to the Rounding account.
- **Control accounts (Q-B):** a trigger on `journal_lines` refuses manual lines (entries with no source document) on inventory, WIP, GR/IR and applied-cost accounts, in Manufacturing companies only.
- **Stock documents** and confirmations are immutable (update and delete refused) except the teacher deleting a whole company and the one-time link of a document to its journal entry. Stock may go negative only if the teacher turns on `allow_negative_stock`.
- **Lots** are issued earliest-expiry first, then oldest first. Valuation stays at item level (standard cost, or moving average); the lot carries traceability.
- **Overhead in postings:** hourly rates and percentages of labor are applied at confirmation; a percentage of bought material is applied at issue. Percentages of *made* sub-assemblies are not applied (the estimate does not include them either).
- **Deferred to 4b:** settlement of the variance left in work in process, reversals of documents and confirmations, co-/by-product receipts, delivery with cost of goods sold, and the automated end-to-end test of the whole Dining Chair story. Deferred to 4c: the vendor invoice with three-way match, and landed cost.
- **Team roles** (segregation of duties) remain Phase 6b.

---

## Phase 4b as built (deviations from the plan above)

- **Migration:** `0032_mfg_settlement.sql`. It redefines three of Manufacturing's own Phase 4a functions with the same signature (`mfg_create_order`, `mfg_post_confirmation`, `mfg_post_fg_receipt`); no Standard object changes. New tables: `mfg_prod_outputs` (co-/by-products copied to the order), `mfg_settlements` (SET-, immutable), `mfg_invoice_links`. New columns on Manufacturing tables: `mfg_material_doc_lines.so_line_id`, `mfg_order_costs.item_id`, `mfg_production_orders.std_mix` and `teco_at`.
- **Settlement (`mfg_settle_order`):** needs the order CONFIRMED or DELIVERED with every good unit received. Under standard costing the 2,936 left in work in process is split by cost element into 5510 material usage, 5520 labor efficiency, 5540 machine and variable overhead, 5550 fixed overhead. The "standard allowed" for each element is the credit given to stock multiplied by the element mix of the released cost estimate, which the order remembers (`std_mix`); a few centavos of rounding land on fixed overhead. Under actual costing the good units take the order's whole cost, so normally nothing is left; anything that never reached stock (for example a co-product that was not received) goes to Scrap & Rework Loss (5560). The order becomes TECHNICALLY_COMPLETE; `mfg_close_order` makes it CLOSED (needs zero work in process); `mfg_reverse_settlement` re-opens a settled order that is not yet closed. The plan's separate "scrap-driven memo" is kept as `scrap_qty` / `scrap_value` on the settlement record and shown under the variance table.
- **Reversals:** `mfg_reverse_document` (goods receipt, material issue, finished-goods and co-/by-product receipt, transfer, count, delivery) and `mfg_reverse_confirmation`. Both need a reason, refuse a date before the original, and post a linked REV document with the opposite stock movement and the exact opposite journal entry. A reversal cannot be reversed and nothing can be reversed twice. Reversing a confirmation also reverses the materials its backflush took (the backflush issue now carries the confirmation id in its memo). Rules that protect the books: goods already received block reversing the confirmation that made them; a settled order's documents are locked until the settlement is reversed; an invoiced delivery cannot be reversed until the invoice is voided. Under actual costing a reversal restores the moving average. A reversed goods receipt re-opens a closed purchase order (the Standard goods-receipt record itself is left as it was).
- **Co-/by-products:** `mfg_post_output_receipt`. Standard costing: the item's own standard cost (set by the released estimate from its cost share); actual costing: its share of the order's real cost. A by-product with no cost share goes into stock at no cost and posts no entry. Receipts cannot exceed what the order expected. Under actual costing the main item now takes only its own share of the order's cost.
- **Delivery and sales:** `mfg_post_delivery` takes finished goods out against a confirmed sales order (earliest-expiry lot first) and posts Dr 5000 cost of goods sold / Cr finished goods at the item's cost. `mfg_create_invoice_from_so` creates a draft invoice for what has been delivered and not yet invoiced, with NO item on its lines, so the existing `post_invoice` posts revenue, receivable and VAT only. Partial deliveries and several invoices per sales order work. New screen: **Shipping** (`/mfg/shipping`).
- **Invoice guard (Q-C, approved):** the Standard Sales page is reused unchanged, so a student could put a stock item on an invoice line and `post_invoice` would post cost of goods sold a second time. A trigger `trg_mfg_invoice_item_guard` on the existing `invoice_lines` table (the third approved change to an existing table, after the two on `journal_lines`) now refuses a line that names a stock item in a Manufacturing company, with a message pointing to Shipping. It also stops the Standard "convert sales order to invoice" for orders with stock items in a Manufacturing company. Standard companies are unaffected.
- **Not in 4b:** the period-end variance close to cost of goods sold (PPV and labor-rate variance, with the PRORATE option), scrap disposal, standard-cost revaluation of stock already received (a reversal posts at the original unit cost) — these belong to the period-close and quality phases.

---

## Phase 4c as built (deviations from the plan above)

- **Migration:** `0033_mfg_vendor_invoice.sql`. New tables `mfg_vendor_invoices` (VI-), `mfg_vendor_invoice_lines`, `mfg_landed_cost_vouchers` (LC-), `mfg_landed_cost_lines`; one new column `mfg_company_settings.match_tolerance_pct` (default 2); `mfg_reconciliation` redefined (same signature). No Standard object changes. The earlier phase tests (4a, 4b) pin the set of existing functions at their own phase, so they report a mismatch if re-run now; each phase's test is the gate for its own phase.
- **Three-way match (`mfg_post_vendor_invoice`):** each invoice line is compared with the order (price) and the goods received and not yet invoiced (quantity). The tolerance is the company's `match_tolerance_pct`, set by the teacher (`set_mfg_match_tolerance`, 0–50). Billing MORE than is open, or a price more than the tolerance away from the order price in either direction, holds the invoice; billing less than is open is allowed. A total above the company's approval limit also holds it. A held invoice posts nothing and creates no bill; the teacher releases it (`mfg_approve_held_invoice`) or the student rejects it with a reason (`mfg_reject_held_invoice`). A duplicate vendor invoice number (any capitals) is refused per vendor, across invoices and freight bills.
- **Posting:** Dr GR/IR at the order price, Dr/Cr Purchase Price Variance for the price difference, Dr Input VAT (1160), Cr Accounts Payable (2000), written through `mfg__post_entry`. A row is inserted into the existing `bills` table with status `received`, so the existing `record_bill_payment`, payables aging and bank matching work unchanged; the Standard `post_bill` is NOT used (it would debit Raw Materials again). Under actual costing the invoice price difference also goes to Purchase Price Variance (the receipt was already valued at the order price), so stock value and the books stay in step.
- **Void (`mfg_void_vendor_invoice`, `mfg_void_landed_cost`):** posts the exact opposite entry and marks the bill void, allowed only while nothing has been paid. The Standard `void_bill` cannot be used: it reverses with entries that carry no source document, which the control-account guard refuses on GR/IR.
- **Landed cost (`mfg_post_landed_cost`):** the vendor's freight/customs invoice is entered together with its spread over chosen goods-receipt lines, by value, quantity, weight or volume, to the centavo (the leftover goes to the first biggest line). Weight and volume are typed on the voucher lines instead of being kept on the item master (deviation: no master-data change). The planned two-step accrual through the Landed-cost clearing account is not used because the freight invoice is in hand; the account key remains available. Standard costing: the amount is Purchase Price Variance and stock stays at standard. Actual costing: the amount for stock still on hand raises the item's moving average (average + amount ÷ quantity on hand); for goods no longer in stock it is a variance. A voided landed cost takes the average back down. Receipts that have been reversed cannot take freight.
- **Books check:** the stock-versus-books screen now has a sixth row, Accounts payable (open bills less payments against the Accounts Payable account), and the GR/IR row subtracts what vendors have invoiced.
- **Not in 4c:** payments reuse the Standard `record_bill_payment` as is (no payment reversal other than the Standard void flows); a Standard bill created by hand in a Manufacturing company is not guarded (the Standard Procurement page is not reachable from the Manufacturing menu).

---

## Phase 5a as built (deviations from the plan above)

- **Migration:** `0034_mfg_planning.sql`. New tables `mfg_forecasts`, `mfg_mrp_runs` (MRP-), `mfg_planned_orders` (PLN-), `mfg_purchase_reqs` (PR-), `mfg_mrp_demand`, `mfg_mrp_grid`, `mfg_mrp_exceptions`, `mfg_pegging`; eleven new functions. Nothing existing is changed or redefined; the Standard fingerprints (functions, columns, policies, triggers) are identical before and after. Capacity, the Gantt chart and collective conversion stay in 5b (migration 0035).
- **The run (`mfg_run_mrp(horizon_days, bucket_days, include_forecast, start)`):** one transaction. It gathers demand (open sales orders for what is not yet delivered, forecast months not yet used up by sales orders, components still to be issued to open production orders, components of firm planned orders), then plans item by item in low-level-code order so a sub-assembly is planned before its components; the components of each planned order become demand for the next level. Netting per bucket: projected stock = stock in the raw-material and finished-goods stores + receipts − requirements; when it would fall below the safety stock, the shortage is covered by a planned order (make) or a purchase requisition (buy). Late dates fall in the first bucket, dates past the horizon are ignored. 60 columns at most; buckets of 1, 7, 14 or 30 days.
- **Lot rules (`mfg__lot_qty`):** LOT_FOR_LOT, FIXED (whole multiples), EOQ (never below the lot size; the lot size field holds the EOQ), MIN_MAX (raised to the minimum, split at the maximum), PERIODIC (the lot size field is the number of periods to cover). The item's scrap % grosses the order quantity up so the good quantity still covers the need. A lead time longer than the time left starts the order today and records how many days late it will finish.
- **Pegging (`mfg_pegging`):** each requirement is matched first-come-first-served to the supply that covers it (stock, open purchase orders, open production orders, firm planned orders, then the new planned orders and requisitions). Deviation from the plan's `planned_id` column: the table stores both sides (kind, document, date) so it can also say that stock or an existing order covers a requirement.
- **Exceptions:** LATE_START, PAST_DUE_RECEIPT, NO_ACTIVE_BOM, RESCHEDULE_IN, NOT_NEEDED. Calendar days are used; the work-centre calendar and holidays are not applied until 5b.
- **Re-running:** a new run marks the previous run's unconverted suggestions DELETED, keeps converted ones and firm planned orders (counted as supply, with their components as demand) and keeps only the latest run's detail (grid, demand, pegging, exceptions); earlier runs stay in the run list. The status FAILED is reserved: a failed run rolls back completely, so no row is left behind.
- **Conversion:** `mfg_convert_planned_order` calls the existing `mfg_create_order` (start date moved to today if it has passed); `mfg_convert_requisitions` calls the existing `mfg_create_po` and puts several requisitions for one vendor on one purchase order. Planned orders you create (`mfg_create_planned_order`) are firm. Forecasts are by month (`mfg_save_forecast`; zero clears).
- **Size:** about 210 items over three BOM levels with 60 sales orders plans in about 0.7 s; the `authenticated` role's statement limit on this project is 8 s.
- **Screen:** `/mfg/planning` (Planning in the menu): run panel, four counters, then tabs for the item-by-item time-phased grid with the requirements and pegging underneath, exceptions, planned orders, purchase requisitions and forecasts.

---

## Manufacturing look and feel (before Phase 5)

- The Manufacturing ERP now has its own **light theme**, modelled on the reference screenshot: a navy sidebar with a blue active item, a white top bar (search, company switcher, user), light cards and tables, a blue primary button. A Manufacturing company is drawn by `src/components/mfg/MfgShell.tsx` (`AppShell` hands over to it); the Standard ERP keeps its dark console look and its own shell code.
- **How it is scoped:** the Manufacturing shell wraps the page in a `mfg-light` class, and a block at the end of `src/app/globals.css` recolours the shared components (panels, tables, buttons, chips, forms, dialogs) only inside that class. No shared component was edited, and the Standard ERP never receives the class. Inline status colours are matched in both spellings React produces (`color:#F2B13C` from the server, `color: rgb(242, 177, 60)` after the browser touches it).
- **New Manufacturing dashboard** (`/mfg`, `src/app/mfg/page.tsx` and `MfgDashboard.tsx`): good units made today against yesterday, open production orders, inventory value, pending purchase orders, a seven-day output chart, production by product (30 days), ongoing production orders, inventory status against reorder levels, quick actions, recent activity, and a "Needs your attention" list (orders awaiting approval, invoices on hold, orders ready to settle, items below reorder level, stock-versus-books differences). It replaces the earlier re-use of the Standard dashboard. There is no equipment-maintenance panel because there is no maintenance module yet; the slot shows what needs attention instead.
