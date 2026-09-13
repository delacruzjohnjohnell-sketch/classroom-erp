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
- **⬜ No editing or voiding** of past transactions — journal entries have a "Reverse" button (posts an offsetting entry, keeps history intact), but invoices/bills themselves still can't be voided directly. Not started.
- **⬜ No CSV/data import** — everything has to be typed in one row at a time. Needs a decision on expected format before building.
- **⬜ Bank reconciliation is manual matching only** — no auto-matching bank transactions against ledger entries by amount/date. Not started.
- **⬜ No multi-user editing indicators** — would need Supabase Realtime presence; last write still silently wins. Not started.
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
