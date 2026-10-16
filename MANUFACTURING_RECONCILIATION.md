# Manufacturing ERP — reconciliation of the "Principal ERP Architect" brief with the plan

Status: **analysis only. No code, no migration.** Phases 1–3 of `MANUFACTURING_PLAN.md` are built and deployed; this document
checks the new brief against them and the remaining phases, and lists what to adopt, what to adapt, and what needs your decision.

## 0. The short version

- **The brief and the plan agree on the core law**: operational events post to the ledger automatically, in one transaction, never by hand;
  posted records are immutable; money and quantities are exact decimals; standard costing and a moving average are both supported.
- **7 of the brief's 8 postings are already in the plan**, line for line (the plan's ₱468 Dining Chair walk-through is the brief's Phase 5 simulation).
- **The brief's table and role names cannot be used literally.** `accounts`, `items`, `journal_entries`, `journal_lines` already exist and are live
  for the Standard ERP. Manufacturing reuses them and adds `mfg_` tables beside them (plan decisions D1, D2, D5).
- **The brief's "services" are SQL functions here.** The app has no server code (plan §1.2, D7): every page calls Supabase directly and every posting is a
  `security definer` SQL function. `AccountingPostingService` becomes one internal SQL function, `mfg__post_entry`, that every posting calls.
- **Real gaps the brief exposes (adopt):** a three-way match with tolerances, landed cost, FIFO/FEFO lot picking, a database check that a journal entry
  balances, a sub-ledger-to-ledger reconciliation, BOM-level yield, "work order can't close until QC is resolved", and a negative-stock guard that reads the company setting.
- **One thing I found in my own work (fix before Phase 4a):** the Phase 2 BOM explosion ignores an item's own scrap % while the Phase 3 costing applies it.
  Production orders must use one rule. Fix below (§4).
- **Needs your decision:** user roles / segregation of duties (§5), and two changes to existing Standard tables the brief implies (§6).

## 1. Constraints — brief vs. what exists

| Brief | Status here | Reconciliation |
|---|---|---|
| Database: "Supabase / Prisma / Drizzle — specify" | Supabase Postgres, `supabase-js` from the browser, SQL migrations, **no ORM, no server code** | Confirm: stay on this. A Prisma/Drizzle layer would add a server tier the app does not have. |
| Never floats; `NUMERIC(19,4)` money, `NUMERIC(19,6)` BOM quantities | All money and quantity columns are `numeric`. Unit costs `numeric(18,6)` (the plan needs ₱505.306122), quantities `(18,4)`/`(18,6)`, journal amounts plain `numeric` (posted to 2 decimals) | **Equivalent or tighter.** Journal amounts are rounded to centavos; unit costs keep 6 decimals. No float is used for stored values. Keep. |
| Atomic: stock + journal in one transaction | Each posting is one SQL function (one transaction) — plan §6.4, D5 | **Match.** Phase 3's release already works this way. |
| Immutable journal and inventory sub-ledger | Journals: `trg_no_edit_je/jl` block update/delete (exists). Stock documents: planned immutable (plan §8) but **no trigger designed yet** | Journals ✓. **Adopt:** explicit update/delete-blocking triggers on every stock document, line and balance-movement table (Phase 4a); corrections only by linked reversal. |
| **Journal entry must satisfy Σdebit = Σcredit, enforced in the database** | **Not enforced anywhere.** Standard postings balance because their functions are written correctly; nothing stops an unbalanced entry reaching `journal_lines` | **Adopt in two layers.** (1) `mfg__post_entry` refuses an unbalanced line set (new code, no approval needed). (2) A deferred constraint trigger on `journal_lines` would make it a database guarantee for *all* entries — that touches an existing table, so it needs your yes (§6, Q-A). |
| No negative stock unless config allows | Plan: `check qty >= 0` "configurable" | **Adapt.** A `CHECK` can't read a setting. Use a trigger on `mfg_stock` that reads a new `allow_negative_stock` company setting (teacher-set, default off). |
| Standard costing with automatic variances + moving average | Both, plus order-level actual accumulation; variances split into 5 accounts; moving-average helper already built (`mfg_moving_average`) | **Match, plus more.** |

## 2. Modules — brief vs. plan

| Brief module / table | In the plan (as built or scheduled) | Verdict |
|---|---|---|
| **A** `accounts` (type, normal_balance, `is_control_account`) | Existing `accounts` (code, name, type). No `is_control_account` | Reuse. **Adopt control accounts** as a flag set known to the engine (RM, WIP, FG, GR/IR, landed-cost clearing, applied labor/overhead). Used for the reconciliation report and, if you approve Q-B, to stop manual journals hitting them. |
| **A** `posting_profiles` (event → debit/credit accounts) | `mfg_account_determination` (key → account), 23 keys, teacher-editable with type checks and audit | **Keep keyed determination, not per-event debit/credit swapping.** Letting an event's debit and credit be re-pointed freely lets a student break accounting. Add a read-only **posting-event catalogue** (event → keys it uses) shown in the "journal entry" panel and in the handbook. |
| **A** `journal_entries`/`journal_lines` with `source_module`, `source_doc_id` | Existing tables already carry `source_table`, `source_id` (used by Phase 3 release) | Match. |
| **B** `items` RM / WIP / FG, standard + moving-average cost, reorder point | `items` (existing) + `mfg_item_master`: RAW/SEMI/FINISHED/PACKAGING/SERVICE, `standard_cost`, `moving_avg_cost`, planned price, price unit, safety stock, `items.reorder_point` | **Match, superset.** |
| **B** `boms`/`bom_lines`: version, effective dates, `is_active`, `expected_yield_pct`, `scrap_factor_pct` | Built: version, alternatives, valid from/to, status DRAFT/ACTIVE/OBSOLETE, line scrap %, phantoms, co-/by-products. Yield exists **per item** (`scrap_pct`), not per BOM | **Adopt BOM-level `yield_pct`** (default 100) so a recipe version can carry its own yield; item scrap stays as the default. See §4. |
| **B** `routings`/`routing_steps` with `standard_labor_rate_per_hr`, `standard_overhead_rate_per_hr` | Built: operations with setup/run/labor/machine minutes; **rates live on the work center by activity and month** (time-phased), overhead from the costing sheet | **Plan is stronger** (rates change by period; one rate per work center, not copied onto every routing). Keep. |
| **B** Cost roll-up service, recursive, with scrap and routing | **Built and tested in Phase 3** (₱468 chair, multi-level stool, phantom, co-product, setup spread over the lot) | Done. |
| **C** `purchase_orders`/`po_lines`, `goods_receipt_notes`/`grn_lines` | Existing PO tables reused + `mfg_po_line_item`; GRN via `mfg_post_goods_receipt` (Phase 4a) | Match. |
| **C** `vendor_invoices` + **3-way match engine with tolerance %** | Plan has the invoice posting (GR/IR clearing, price variance, VAT, AP via a `bills` row) but **no match engine and no tolerance** | **Adopt.** Match PO price/qty ↔ received qty ↔ billed price/qty; teacher-set tolerance (default 2 %); outside tolerance the invoice is **held** (not posted) with the reason. New phase 4c. |
| **C** `landed_cost_vouchers` (freight/customs by weight, volume or value) | **Absent** | **Adopt** (Phase 4c). Needs weight and volume on the item master, a Landed-cost clearing account and key. Under standard costing the allocation above standard goes to purchase price variance; under moving average it is capitalised — the brief's flat "DR inventory" would break standard cost, so this is adapted, not copied. |
| **D** warehouses/locations (quarantine, RM, WIP floor, FG) | `mfg_storage_locations` kinds RM/WIP/FG/QUARANTINE, seeded | Match (no separate "warehouse" level — locations are enough at classroom scale). |
| **D** lots with expiry; **FIFO/FEFO enforcement** | `mfg_batches(expiry?)` planned; no picking rule | **Adopt:** batch-tracked items are issued first-expiry-first-out (FEFO), else first-in-first-out; the issue function picks the lots, the student may override only if the teacher allows. Valuation stays at item level (standard, or moving average); the lot carries traceability. |
| **D** `inventory_transactions` immutable sub-ledger with `journal_entry_id` | `mfg_material_documents` + `mfg_material_doc_lines` + `mfg_stock` (balance), each document linked to its journal entry, idempotency key | **Same thing, different name.** The document lines are the sub-ledger. Add the immutability triggers (above) and a **sub-ledger ↔ general-ledger reconciliation** (stock value by account = GL balance) as a built-in report and test. |
| **E** `work_orders` DRAFT→RELEASED→IN_PROGRESS→COMPLETED→CLOSED | CREATED→(PENDING_APPROVAL)→RELEASED→PARTIALLY_CONFIRMED→CONFIRMED→DELIVERED→TECHNICALLY_COMPLETE→CLOSED | **Plan is finer.** Mapping: DRAFT=CREATED, IN_PROGRESS=PARTIALLY_CONFIRMED, COMPLETED=CONFIRMED/TECO, CLOSED=CLOSED. Keep ours. |
| **E** Explicit issue **and** backflush | Both (per-component backflush flag) | Match. |
| **E** `wo_time_logs` (labor and machine hours against steps) | `mfg_confirmations` (labor_h, machine_h, setup_h, yield, scrap) | Match. |
| **E** WIP nets to exactly 0.0000 at closure | TECO settlement clears WIP; CLOSED requires zero WIP; tested in the worked example (WIP 48,800 − 45,864 = 2,936 swept) | Match. |
| **F** QC inspections: quarantine → unrestricted or scrap | Phase 6 inspection lots with accept / scrap / return / rework | Match. |
| **F** "WO cannot CLOSE until child QC inspections resolved" | Not stated | **Adopt** as a closing rule in Phase 6 (and a test). |
| **F** sales orders, delivery notes (COGS), AR invoices (revenue + output tax) | Existing sales tables reused; `mfg_post_delivery` (Dr COGS / Cr FG); revenue/AR/VAT through the existing `post_invoice` with no item link | Match. |

## 3. The brief's 8 postings

| # | Brief | Plan function | Status |
|---|---|---|---|
| 1 | GRN: Dr RM / Cr GR-IR (+PPV if standard) | `mfg_post_goods_receipt` | Planned 4a |
| 2 | Landed cost: Dr RM / Cr Landed-cost clearing | — | **New, 4c** (adapted for standard costing) |
| 3 | 3-way matched invoice: Dr GR-IR (+VAT) / Cr AP | `mfg_post_vendor_invoice` | Planned; **match engine added, 4c** |
| 4 | Material issue (explicit or backflush): Dr WIP / Cr RM | `mfg_post_material_issue` | Planned 4a |
| 5 | Labor and overhead absorption: Dr WIP / Cr Direct labor applied, Overhead applied | `mfg_post_confirmation` (5700, 5710, 5720) | Planned 4a |
| 6 | FG completion at standard: Dr FG / Cr WIP | `mfg_post_fg_receipt` | Planned 4a |
| 7 | WO closure: sweep residual WIP to usage / efficiency / overhead variance | `mfg_settle_order` | Planned 4b |
| 8 | Shipment: Dr COGS / Cr FG | `mfg_post_delivery` | Planned 4b |

## 4. A fix I owe from Phases 2 and 3

`mfg_explode_bom` (Phase 2) multiplies each line by `(1 + line scrap %)` but **ignores the item's own yield loss** (`mfg_item_master.scrap_pct`).
`mfg_create_cost_estimate` (Phase 3) applies it (start = good ÷ (1 − scrap %)). A production order built on the explosion would therefore need
less material than the cost estimate priced. Before Phase 4a I will: add the optional BOM-level `yield_pct`, make explosion, costing and (later) production orders all call
**one** quantity rule, and add a test that explosion quantities × planned prices equal the estimate's material cost. This is an additive change to my own Manufacturing functions only.

## 5. Segregation of duties (brief §4) — needs your decision

The brief asks for roles inside a company: `BOM_ENGINEER` may not issue materials or approve variances; `WAREHOUSE_CLERK` may not create POs or post vendor invoices.

**The obstacle:** in this app every student runs a whole company alone. There are only two roles, student and teacher, and the plan fixes one Manufacturing company per student (D4).
Roles only mean something when several people share a company.

| Option | What it takes | My view |
|---|---|---|
| **A. Skip** | Nothing. Keep the teacher-approval rule on production-order release. | Cheapest; loses the control-design lesson. |
| **B. "Controls mode" with team companies (recommended, later)** | A teacher-assigned role per member of a company (`mfg_company_roles`), a teacher switch "enforce segregation of duties", and every posting function checking the caller's role. Needs team companies (several students in one Manufacturing company), which changes D4 and the join list I just changed. | Best teaching value; build after Phase 6 so the permissions table covers every function that exists. |
| **C. Simulate** | One student, several "hats" they must switch between. | Weak — one person can still do everything. |

Independently of the choice, the third rule (**no closing a work order while QC is unresolved**) is a plain status guard and is adopted in Phase 6.

## 6. Questions that touch existing Standard objects (need your yes)

- **Q-A — Balance check in the database.** Add a deferred constraint trigger on `journal_lines` so *no* entry anywhere can be saved unbalanced. It protects Standard companies too and is the brief's "database-level constraint". Cost: one trigger on an existing table, and a one-time scan to confirm no existing entry is unbalanced. Without it, only my new posting function guards the Manufacturing entries.
- **Q-B — Control accounts closed to manual journals.** For Manufacturing companies, refuse manual journal lines on inventory, WIP, GR/IR and clearing accounts ("operational events drive these accounts"). Needs a trigger on `journal_lines` (existing) or an edit to the shared journal screen. Default if you say nothing: no change; the reconciliation report would instead *show* any manual postings to control accounts.

## 7. Revised roadmap

Nothing already built changes. The plan's phases absorb the brief like this:

| Brief phase | Plan phase | Contents after reconciliation |
|---|---|---|
| 1 Architecture & schema | **Done** (our 1–3) | Master data, BOM/routing, costing, determination |
| 2 Accounting + inventory kernel | **4a (first half)** | `mfg__post_entry` (balance-checked, idempotent), immutable material documents, stock with FEFO/FIFO and the negative-stock guard, goods receipt, sub-ledger ↔ GL reconciliation; tests that no event can unbalance a journal or desync the sub-ledger |
| 3 Manufacturing & costing | **4a (second half) + 4b** | Production order lifecycle, issue / backflush / confirmation / FG receipt; then settlement, variances, reversals, delivery and COGS |
| 4 P2P & O2C | **4c (new)** + 4b | Vendor invoice with three-way match and tolerance, landed cost, AP; delivery and sales invoice |
| 5 Seed & simulation | **Phase 7** (and an automated end-to-end SQL test in 4b) | The Dining Chair scenario: buy, produce with a material variance, ship, then Trial Balance and Income Statement |
| (plan only) | 5a/5b, 6 | MRP and capacity; quality, OEE, roles if you choose option B |

## 8. Decisions (recorded 2026-10-16)

All of the following were approved by the user.

1. **Stack:** stay on Supabase + SQL functions; no ORM, no server tier.
2. **Adopted:** three-way match with tolerance, landed cost, FEFO/FIFO lot picking, BOM-level yield, sub-ledger ↔ GL reconciliation, "work order can't close until QC is resolved", negative-stock setting (trigger reading the company setting). New **Phase 4c** (invoice + match + landed cost + AP).
3. **Segregation of duties = option B:** a teacher switch for **team companies** with teacher-assigned roles (`BOM_ENGINEER`, `WAREHOUSE_CLERK`, … ), enforced inside every posting function. Built **after Phase 6**. This relaxes D4 (one Manufacturing company per student) for team companies only, and the join list must then offer a team company to the students the teacher assigns.
4. **Q-A approved:** a deferred constraint trigger on `journal_lines` so no entry can be saved unbalanced. Pre-check done on the live database: **638 entries, 1,616 lines, 0 unbalanced, 0 entries without lines, 0 negative amounts.** (6 lines carry both a debit and a credit, so the rule is on the entry's totals, not "one side per line".) It will ship as its own small migration with a rollback and a test, **before** Phase 4a's posting kernel relies on it.
5. **Q-B approved:** Manufacturing companies refuse manual journal lines on control accounts (inventory, WIP, GR/IR, clearing, applied labor/overhead). Ships in the same migration pass, as a trigger that applies only to Manufacturing companies (Standard companies are untouched).
6. **First step of Phase 4a:** fix the explosion/costing yield inconsistency (§4), then the posting kernel.

## 9. Updated order of work

1. **Pre-4a:** §4 yield fix; migration for Q-A (balance trigger) and Q-B (control accounts) with tests and Standard regression.
2. **4a:** `mfg__post_entry`, immutable material documents, stock (FEFO/FIFO, negative-stock trigger), goods receipt, reconciliation report, production orders through FG receipt.
3. **4b:** settlement, variances, reversals, delivery/COGS, automated end-to-end test of the Dining Chair scenario.
4. **4c:** vendor invoice with three-way match and tolerance, landed cost, AP.
5. **5a/5b:** MRP and capacity. **6:** quality, OEE, close-after-QC. **6b:** team companies and roles (option B). **7:** analytics, period close, teacher comparison, demo loader.
