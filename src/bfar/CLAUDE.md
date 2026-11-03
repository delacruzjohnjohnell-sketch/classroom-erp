# BFAR module (Basic Financial Accounting and Reporting)

A fourth, standalone module in this repo, for Prof. Win Ballada's course. It does not touch the Standard, Manufacturing or AIS editions: no tenants, no `AppShell`. It uses the same login (`useSession`) and one table of its own (`bfar_submissions`, migration 0083). Routes live under `/bfar` (`src/app/bfar`), code under `src/bfar`. The only shared file it changes is the card on `src/app/choose/page.tsx`.

## Rules that must not break

- **Money is integer centavos** (₱1.00 = 100). Never use floats for amounts. Rounding is half away from zero (`roundDiv`, `percentOf` in `lib/currency.ts`). Dates are ISO `YYYY-MM-DD`.
- **Double entry:** every entry has ΣDr = ΣCr; the message is `Debits (₱X) do not equal Credits (₱Y)`. A line is a debit or a credit, never both. All student input goes through the Zod schemas in `core/journalizer.ts`.
- **Normal balances:** assets, expenses, Drawing = debit; liabilities, equity, revenues = credit. Contra accounts (110-A, 160-A, 170-A, 421, 422, 502, 503) carry the opposite balance of the account they offset.
- **Prepaids:** asset method (debit Prepaid; adjust the EXPIRED part) vs expense method (debit Expense; adjust the UNEXPIRED part). **Unearned:** liability method (adjust the EARNED part) vs income method (adjust the UNEARNED part). Only accruals, expense-method prepaids and income-method unearned are reversed (`reversing-engine.ts`).
- **Depreciation** is straight-line, (cost − salvage) ÷ life. **Uncollectibles** use a percentage of receivables or aging, net of the existing allowance.
- **Worksheet** has 10 columns. Net income: Dr column 7 and Cr column 10. Net loss: Cr column 8 and Dr column 9. Under the periodic system the ending inventory is a credit in column 8 and a debit in column 9, on the same line as the beginning inventory.
- **Closing (REID):** revenue → Income Summary, expenses → Income Summary, Income Summary → Capital, Drawing → Capital. Periodic inventory: debit ending inventory in entry 1, credit beginning in entry 2.
- **Statements** follow PAS 1: single underline on subtotals, double underline (`border-b-4 border-double`) on totals.

## Students never see answers

- Students journalize from **source documents** (`practice-sets/documents.ts`, `SourceDocumentCard`). No instant check, no hints, no key. They save and submit (`lib/bfarApi.ts` → `bfar_save`); the teacher checks on `/bfar/teacher` and releases the result, and only then does the student get right/wrong, hints and the correct entry (`bfar_my` returns the marking only when released).
- **Keys live only in `practice-sets/keys.ts`**, reached through `practice-sets/solution.ts`, and only from the teacher page (dynamic import) and the tests. A test fails if any other file imports them. Never add a key, hint or expected total to a file students load.
- Teacher = `profiles.role = 'teacher'`; the database functions enforce it, the page also redirects.

## Books are separate, and students build the books themselves

- Every page works on one **book** (`activeBook` in the store): a practice set, or the student's free journal (`FREE_BOOK`). Entries are filtered with `entriesOfBook`; never merge books.
- The **ledger, trial balance and worksheet are entered by hand** (`components/StudentWorkspaces.tsx`, data in `core/student-work.ts`). Never auto-generate them for students. The ledger is posted from the *transactions*; the adjusting entries go on the worksheet. They are saved and submitted with the journal (`answers` column holds `{ v: 2, journal, work }`; older rows hold the journal alone).
- The teacher's grading (`practice-sets/solution.ts`: `gradeWork`, `gradeSubmission`) builds the expected books from the key and compares: one point per ledger account, trial balance row, worksheet row, plus the two totals. `perfectWork` produces a fully correct set of books for tests and demonstrations.
- The statements page still generates statements from the student's own journal for the chosen book.

## Layout

- `core/`: pure functions, no React. `types`, `chart-of-accounts` (Ballada codes; 505 Cost of Goods Sold is added for perpetual only), `journalizer`, `ledger-posting`, `trial-balance`, `adjustments-engine`, `worksheet-engine`, `closing-engine`, `post-closing-tb`, `reversing-engine`, `statements-generator`, `evaluator` (compares an entry with a key; used by the teacher's grading only).
- `practice-sets/`: Set A CleanPro (service), Set B Metro Hardware (merchandising, periodic), Set C Bayanihan (comprehensive service, 28 documents, 10 adjustments). The set files hold facts and documents only; `keys.ts` holds the keys, hints and expected totals.
- `store/useAccountingStore.ts`: Zustand with `persist` (`bfar-accounting-v1`, `skipHydration`). Pages render stored data only after `useHydrated()`.
- `components/`, `src/app/bfar/*`: UI.

## Tests

`npm run test:bfar` (Vitest, config in `vitest.config.ts`, files in `src/bfar/__tests__`). The repo's existing `npm test` (node:test under `tests/`) is separate and unaffected. `npm run typecheck` for types.
