# Ledger & Co. — Classroom ERP

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
5. Go to **Authentication → Providers → Email**, make sure the **Email** provider itself is enabled,
   and turn **off** "Confirm email" for the fastest classroom setup (students can sign up and start
   immediately). Turn it back on if you want email verification for a real deployment.
6. Go to **Project Settings → API** and copy your **Project URL** and **Publishable key** (this is
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
