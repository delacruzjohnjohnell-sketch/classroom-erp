# Classroom ERP — Audit

Based on a direct review of the code as deployed, not a general impression. ~2,380 lines across the app.

**Update:** everything in "Real problems" is now fixed, and most of "Missing features" is too — see the ✅/⬜ marks below. Left as the original audit text for anyone comparing before/after; the fixes are documented in git history and in each migration file's own comments.

---

## 🔴 Real problems (fix before real classroom use)

### ✅ 1. Silent failures on writes — fixed
Most `insert`/`update`/`rpc` calls don't check for an error response. If a write fails (network blip, RLS denial, bad data), the UI just quietly does nothing — no error message, and the modal closes as if it worked. Confirmed by scanning: Sales, HR, Procurement, Inventory, and Banking pages **have zero error-handling** on their database writes. Only Financials checks at all, and only partially.

**Impact:** a student could think they recorded a sale and it silently didn't save — confusing to debug, worse to teach with.

*Fixed by `src/lib/toast.tsx` + `src/lib/mutate.ts`, applied across every page.*

### ✅ 2. No loading/disabled state on submit buttons — fixed
Every "Save" button can be clicked multiple times while the request is in flight (e.g., double-clicking "Record sale" could post two journal entries). There's no `disabled={submitting}` guard anywhere in the forms.

*Fixed — every form now tracks `submitting` and disables its button with a spinner.*

### ✅ 3. Auth trigger has no error handling — fixed
`handle_new_user()` (the trigger that creates a profile row on signup) will silently fail a signup if it throws for any reason — the user gets a generic Supabase error with no indication the trigger is the cause. Worth wrapping in exception handling with a clear message.

*Fixed by migration `0013_auth_trigger_error_handling.sql`.*

### ✅ 4. No confirmation before irreversible actions — fixed
Fulfilling an invoice, receiving a bill, and running payroll all immediately post journal entries — there's no "are you sure?" step and no undo. For a teaching tool, a wrong click means asking me (or you) to manually fix the ledger.

*Fixed — `ConfirmDialog` now gates posting an invoice, receiving a bill, and posting 13th month pay; the regular payroll run already had its own preview-and-confirm modal.*

### ✅ 5. Teacher role is self-assigned at signup — already fixed
Anyone can sign up and pick "Teacher" — there's no invite code or approval step. Fine for solo testing; **not fine** once you share the live link with actual students, since any of them could sign up as a teacher and see everyone's books.

*Turned out already fixed by migration `0005_restrict_teacher_role.sql`, which hard-locks the teacher role to one specific email regardless of what signup claims.*

---

## 🟡 Missing features (known gaps, not bugs)

- **✅ Search/filter on tables** — added to the biggest lists: Sales (customers/quotes/orders/invoices), Procurement (vendors/POs/receipts/bills), Inventory (items), HR (employees), Financials (journal entries). Banking's transaction list doesn't have one yet — same `SearchBox` pattern, just not wired up there.
- **✅ Editing/voiding past transactions** — journal entries already had "Reverse" (0004). Migration `0015_void_invoices_bills.sql` extends the same reversing-entry pattern up to the document level: a posted, unpaid invoice or bill can now be voided — it posts a proper offsetting journal entry and rolls back the inventory it moved, rather than deleting anything. A document with payments recorded against it still can't be voided directly (reverse the payment first, then void) — a "void with payments" flow needs more design than a quick pass allows for.
- **✅ CSV import with a fixed template** — `src/components/CsvImport.tsx` (a hand-rolled CSV parser, no new dependency) wired into Sales > Customers, Procurement > Vendors, and Inventory > Items — the three master-data lists most useful to bulk-seed for a class demo. Fixed column templates per entity; extra columns ignored, missing required ones block the import with a clear message.
- **✅ Bank reconciliation auto-matching** — Banking > Auto-match matches unreconciled transactions to a journal line on the same account by equal amount and a date within 3 days, using `matched_journal_entry_id` — a column that's existed in the schema since migration 0002 but no code ever used until now.
- **✅ Multi-user presence indicator** — `src/lib/presence.ts`, using Supabase Realtime Presence (no migration needed — it's an ephemeral broadcast, not a table). Shows who else from the same company is on the same page right now. Deliberately scoped to "is anyone else here," not "is someone editing this exact row" — a real per-record lock is a bigger feature than an indicator.
- **⬜ No email notifications** — needs an email provider (Resend, SendGrid, etc.) and an API key before this can be built. Not started.
- **✅ `invoicePayments`/`billPayments` validated against the remaining balance** — the UI already capped/disabled overpaying; migration `0014_payment_amount_guard.sql` adds the real enforcement, a database trigger that rejects the insert outright, closing the devtools loophole.

---

## 🟢 What's actually solid

- **RLS is real and tested** — the tenant-isolation policies are enforced by Postgres itself, not just hidden in the UI. This is the single most important thing to get right and it's done correctly.
- **The five RPC functions** (receive bill, fulfill invoice, two payment functions, run payroll) are atomic and keep the double-entry math correct — verified by re-deriving the accounting logic while auditing.
- **Type-checking passes clean** (`tsc --noEmit`), and the production build compiles with no errors across all 14 routes.
- **53 uses of `any`** in the codebase — not dangerous, but a sign this was built fast rather than with strict typing throughout. Worth tightening if students will read the code as a learning example.

---

## Suggested next priority order

1. Add error toasts/messages on every write (biggest trust issue)
2. Disable submit buttons while a request is in flight
3. Add a teacher invite code so the live link is safe to actually share
4. Add a confirmation step before fulfill/receive/payroll actions
5. Everything in the "missing features" list, roughly in that order
