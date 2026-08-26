# Classroom ERP — Audit

Based on a direct review of the code as deployed, not a general impression. ~2,380 lines across the app.

---

## 🔴 Real problems (fix before real classroom use)

### 1. Silent failures on writes
Most `insert`/`update`/`rpc` calls don't check for an error response. If a write fails (network blip, RLS denial, bad data), the UI just quietly does nothing — no error message, and the modal closes as if it worked. Confirmed by scanning: Sales, HR, Procurement, Inventory, and Banking pages **have zero error-handling** on their database writes. Only Financials checks at all, and only partially.

**Impact:** a student could think they recorded a sale and it silently didn't save — confusing to debug, worse to teach with.

### 2. No loading/disabled state on submit buttons
Every "Save" button can be clicked multiple times while the request is in flight (e.g., double-clicking "Record sale" could post two journal entries). There's no `disabled={submitting}` guard anywhere in the forms.

### 3. Auth trigger has no error handling
`handle_new_user()` (the trigger that creates a profile row on signup) will silently fail a signup if it throws for any reason — the user gets a generic Supabase error with no indication the trigger is the cause. Worth wrapping in exception handling with a clear message.

### 4. No confirmation before irreversible actions
Fulfilling an invoice, receiving a bill, and running payroll all immediately post journal entries — there's no "are you sure?" step and no undo. For a teaching tool, a wrong click means asking me (or you) to manually fix the ledger.

### 5. Teacher role is self-assigned at signup
Anyone can sign up and pick "Teacher" — there's no invite code or approval step. Fine for solo testing; **not fine** once you share the live link with actual students, since any of them could sign up as a teacher and see everyone's books.

---

## 🟡 Missing features (known gaps, not bugs)

- **No search/filter** on any table — once a company has 50+ invoices, the list is just a long unpaginated table.
- **No editing or voiding** of past transactions — once a journal entry, invoice, or bill is created, it's permanent. Real accounting has correcting entries; this doesn't yet.
- **No CSV/data import** — everything has to be typed in one row at a time. No bulk seed data for a class demo.
- **Bank reconciliation is manual matching only** — no auto-matching bank transactions against ledger entries by amount/date.
- **No multi-user editing indicators** — if two students on the same team have the app open, there's no "someone else is editing this" signal; last write silently wins.
- **No email notifications** — students don't get notified when a teacher comments or when an invoice is overdue.
- **`invoicePayments`/`billPayments` aren't validated against the remaining balance** in the UI beyond a `max` attribute on the input — a determined user could overpay via devtools.

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
