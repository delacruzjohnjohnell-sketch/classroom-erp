# JJ and Co. — Classroom ERP

A real, deployable ERP teaching app: Financials, Procurement, Inventory, Sales/CRM, HR, Reports, and a
cross-module Dashboard. Students each run their own company ("tenant"); the teacher sees every company
at once. Free to run and host.

## 1. Create your database (5 minutes)

1. Go to [supabase.com](https://supabase.com) → New project (free tier is plenty for a class).
2. Once it's ready, open **SQL Editor** → New query.
3. Paste in the entire contents of `supabase/migrations/0001_init.sql` and click **Run**.
   This creates every table, the security rules that keep each student's data separate, and the
   business-logic functions (receiving a bill, fulfilling an invoice, running payroll). If Supabase
   shows a "Row Level Security" warning dialog, choose **Run and enable RLS** — that matches what
   this script does anyway.
4. Open a **second** New query, paste in `supabase/migrations/0002_invoicing_upgrade.sql`, and run it
   too. This adds due dates, partial payments, A/R and A/P aging, bank reconciliation, and file
   attachments — the features that make this feel closer to QuickBooks than a bare ledger.
5. Open a **third** New query, paste in `supabase/migrations/0003_coa_assets_payroll.sql`, and run it.
   This adds an editable chart of accounts, multi-bank-account support, fixed assets with
   depreciation, and Philippine statutory payroll (SSS, PhilHealth, Pag-IBIG, withholding tax).
6. Open a **fourth** New query, paste in `supabase/migrations/0004_period_lock_numbering_audit.sql`,
   and run it. This adds human-readable invoice/bill numbers, a period-lock control (so closed
   months can't be silently edited), journal-entry immutability with proper reversing entries,
   and an audit trail showing who posted each entry.
7. Open a **fifth** New query, paste in `supabase/migrations/0005_restrict_teacher_role.sql`, and
   run it. This locks the Teacher role to one specific email address — edit the email inside that
   file first if you need to change it.
8. Open a **sixth** New query, paste in `supabase/migrations/0006_employee_details_payslip.sql`, and
   run it. This adds employee statutory ID fields (TIN, SSS/PhilHealth/Pag-IBIG numbers) and
   auto-generated employee numbers.
9. Open a **seventh** New query, paste in `supabase/migrations/0007_approval_thresholds.sql`, and
   run it. This adds a company-set dollar threshold above which invoices and bills queue for
   teacher approval instead of posting immediately.
10. Open an **eighth** New query, paste in `supabase/migrations/0008_sales_order_quote_chain.sql`,
   and run it. **This one renames tables** — it turns the old "sales_orders" table (which was really
   acting as an invoice) into a real `invoices` table, and creates genuine `quotes` and `sales_orders`
   tables for the stages before it. All your existing invoice data is preserved, just under its
   correct name — nothing is deleted.
11. Open a **ninth** New query, paste in `supabase/migrations/0009_purchase_order_receipt_chain.sql`,
   and run it. Same idea on the procurement side: the old "purchase_orders" table (really a bill)
   becomes `bills`, and genuine `purchase_orders` and `goods_receipts` tables are added before it.
13. Open a **tenth** New query, paste in `supabase/migrations/0010_hr_depth.sql`, and run it. This
   adds time tracking, leave requests, employee loans, 13th month pay, and semi-monthly pay periods.
14. Open an **eleventh** New query, paste in `supabase/migrations/0011_hourly_pay_wiring.sql`, and
   run it. This adds an hourly pay type, so time tracking actually feeds into pay for those employees.
15. Open a **twelfth** New query, paste in `supabase/migrations/0012_recurring_entries.sql`, and run
   it. This adds recurring journal entry templates.
16. Open a **thirteenth** New query, paste in `supabase/migrations/0013_auth_trigger_error_handling.sql`,
   and run it. This wraps the signup trigger in exception handling, so a failed signup surfaces a clear
   message instead of a bare Postgres error, and logs the real cause for you to debug.
17. Go to **Authentication → Providers → Email**, make sure the **Email** provider itself is enabled,
   and turn **off** "Confirm email" for the fastest classroom setup (students can sign up and start
   immediately). Turn it back on if you want email verification for a real deployment.
18. Go to **Project Settings → API** and copy your **Project URL** and **Publishable key** (this is
   what used to be called the "anon key" — it's safe to use in the browser).

## 2. Run it locally

```bash
npm install
cp .env.example .env.local
# paste your Project URL and anon key into .env.local
npm run dev
```

Open http://localhost:3000 — sign up as a teacher, and separately as one or more students to try the
full flow (each student either joins an existing company or starts a new one).

## 3. Deploy it for the class (free)

1. Push this folder to a GitHub repo.
2. Go to [vercel.com](https://vercel.com) → New Project → import the repo.
3. Add the same two environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   in Vercel's project settings.
4. Deploy. Share the resulting URL with your class.

## How data is isolated

Every operational table has a `tenant_id`. Postgres Row-Level Security (see the migration file) enforces
that a student can only read or write rows belonging to their own tenant — teachers can read and write
every tenant. This is enforced by the database itself, not just hidden in the UI, so it holds even if
someone inspects network requests.

## How the modules connect

Five Postgres functions keep multi-table actions atomic, mirroring what a real ERP's transaction
engine does:

- `receive_purchase_order(po_id)` — updates/creates inventory items and posts a balanced
  Dr Inventory / Cr Accounts Payable journal entry.
- `fulfill_sales_order(so_id)` — decrements inventory, posts Dr Accounts Receivable / Cr Revenue for
  the invoice and Dr COGS / Cr Inventory for the cost. Cash does **not** move at this point — that's
  what makes due dates and partial payments meaningful.
- `record_invoice_payment(...)` — posts Dr Cash / Cr Accounts Receivable when a customer pays.
- `record_bill_payment(...)` — posts Dr Accounts Payable / Cr Cash when you pay a vendor.
- `run_payroll(tenant_id)` — posts one month of payroll expense across every employee.

Everything downstream (Dashboard, Reports) reads from the same `journal_entries` / `journal_lines`
tables, so any transaction anywhere in the app is reflected correctly in the financial statements.

## QuickBooks-style features

- **Invoices and bills carry real due dates**, and payment status (Draft / Open / Partial / Paid /
  Overdue) is computed live from due date and amount paid — not a manually-set field.
- **Partial payments** — record any amount against an invoice or bill; the balance updates
  automatically and status moves from Open → Partial → Paid.
- **A/R and A/P aging reports** — outstanding balances bucketed into Current / 1-30 / 31-60 / 61-90 /
  90+ days overdue, with a chart, on the Reports page.
- **Bank reconciliation** — log each line from your bank statement in Banking, mark it reconciled once
  it matches your books, and see at a glance whether your ledger cash balance agrees with the bank.
- **File attachments** — attach a receipt or invoice PDF to any invoice or bill (stored in Supabase
  Storage, scoped per-tenant the same way every other table is).
- **Sidebar navigation** — a persistent left-hand nav instead of top tabs, closer to how QuickBooks,
  Xero, and NetSuite actually lay out their app shell.
- **Editable chart of accounts** — add, rename, retype, or delete accounts directly from Financials,
  instead of being stuck with the seeded default list.
- **Multiple bank accounts** — flag any asset account as a bank account; Banking now shows a
  per-account dropdown with its own transaction log and reconciliation, not just one "Cash" bucket.
- **Fixed assets & depreciation** — a real asset register (cost, salvage value, useful life) with
  one-click straight-line monthly depreciation that posts Dr Depreciation Expense /
  Cr Accumulated Depreciation, exactly like a real books close.
- **Philippine statutory payroll** — running payroll now computes SSS, PhilHealth, and Pag-IBIG
  (both employee and employer shares) plus BIR withholding tax per employee, shows a preview before
  posting, and remits everything as proper payable liabilities — not just a lump "payroll expense."
  Rates live in `src/lib/philippinePayroll.ts` and are approximate 2023–2024 tables; verify against
  current issuances before relying on this for real payroll.
- **Document numbering** — invoices and bills now get real numbers (INV-0001, BILL-0001), auto-assigned
  per company, instead of being identified only by an internal ID.
- **Period lock** — set a "books locked through" date in Financials; no one can post a journal entry
  dated on or before it. Teaches the real concept of closing a month's books.
- **Journal immutability + reversing entries** — a posted journal entry can no longer be edited or
  deleted at the database level. Mistakes get corrected with "Reverse" — a real accounting workflow,
  not a silent edit to history.
- **Audit trail** — every journal entry now shows who posted it, resolved from the account that created
  it (also fixed a related bug: teammates sharing a company couldn't previously see each other's names).
- **Restricted teacher access** — the Teacher role is locked server-side to one specific email
  address, regardless of what a signup form claims. Anyone else who tries "Teacher" at signup is
  silently assigned Student instead.
- **Payslip generation** — every payroll run's per-employee breakdown is now browsable (Payroll
  history → expand a run) with a "Payslip" link that opens a clean, printable payslip in a new tab
  (Print / Save as PDF), showing the employee's TIN, SSS, PhilHealth, and Pag-IBIG numbers alongside
  the full earnings/deductions breakdown.
- **Fuller employee records** — employees now get an auto-generated employee number (EMP-0001) and
  optional statutory ID fields, captured once and reused on every payslip.
- **Approval thresholds** — the teacher can set a dollar amount in Bills or Invoices above which a
  student's transaction queues as "Pending Approval" instead of posting immediately. The teacher
  approves with the same button a student would've used ("Mark received" / "Send invoice") — calling
  it as the teacher is what makes it post. This is the single biggest structural piece that makes the
  system behave like a real ERP instead of a ledger anyone can write to freely.
- **Attachments on journal entries** — any journal entry can now have files attached (a paperclip
  icon next to "Reverse" in the journal table), not just invoices and bills.
- **Real document lifecycles** — Sales now runs Quote → Sales Order → Invoice → Payment as four
  genuinely distinct stages (a Quote and a Sales Order carry no accounting impact at all; only the
  Invoice posts to the ledger). Procurement runs Purchase Order → Goods Receipt → Bill → Payment,
  with Goods Receipts tracking partial deliveries against a PO before a Bill is ever created. Each
  stage has its own document number (QT-0001, SO-0001, PO-0001, GR-0001) and its own tab in the
  Sales / Procurement pages.
- **Time & Attendance** — log hours per employee per day. **Wired into actual pay**: an employee can
  now be set to Hourly pay type, and their gross pay on every payroll run is computed directly from
  hours logged in the pay period × their rate (pulled live from Time & Attendance, not a fixed
  number). Monthly-salaried employees are unaffected — their pay stays fixed and their time entries
  remain attendance records only, matching how real payroll actually treats the two employment types
  differently.
- **Leave management** — employees can have leave requests filed against them (vacation/sick/
  emergency/unpaid), with teacher-only approval enforced at the database level, not just hidden in
  the UI.
- **Employee loans** — issue a loan to an employee (posts Dr Employee Loans Receivable / Cr Cash
  immediately), and its monthly installment is automatically deducted from that employee's next
  payroll run until paid off, with the payroll journal entry correctly crediting the loan receivable
  instead of Cash for that portion.
- **13th month pay** — one click sums each employee's actual gross pay from the year's regular
  payroll runs, divides by 12 (the Philippine statutory formula), and posts it as its own payroll run.
- **Semi-monthly pay periods** — Run Payroll now offers Monthly, or Semi-monthly 1st/2nd half.
  Statutory contributions and loan deductions are withheld once per month (on the 2nd cutoff),
  matching common Philippine payroll practice; withholding tax is computed on both halves using a
  scaled version of the monthly BIR bracket table (documented in `philippinePayroll.ts` as an
  approximation, not the official separate semi-monthly table).
- **Recurring entries** — Financials → Recurring lets you set up a template (e.g. monthly rent) that
  tracks its own next-due date. Honest limitation: this stack has no background job scheduler, so
  posting isn't silent/automatic — the system flags what's due in red and you post it in one click.
- **Global search** — a search bar in the top bar of every page finds customers, vendors, inventory
  items (by name or SKU), employees (by name or employee number), and any document by its number
  (invoices, bills, sales orders, purchase orders, quotes), grouped by type, and takes you straight
  to the right page and tab.

## Project structure

```
src/
  app/            one folder per module (dashboard, financials, procurement, inventory, sales, hr, reports)
  app/login        sign up / sign in + "join or create a company" onboarding
  app/teacher      teacher's cross-company overview
  components/      shared UI (AppShell nav, KPI cards, modals, the reusable line-item form)
  lib/             Supabase client, shared types, and the pure metrics/report calculations
supabase/migrations/0001_init.sql   the entire database schema, RLS policies, and RPC functions
```

## What's simplified (by design, for teaching)

- One item per purchase-order / sales-order line references an item by name — no SKU merge conflicts
  are handled beyond a simple case-insensitive name match.
- No multi-currency, no tax engine, no approval workflows.
- Retained earnings in the balance sheet is simplified to "all-time net income" rather than tracking
  period-close rollovers.

These are natural next assignments for students once the core loop is working.
