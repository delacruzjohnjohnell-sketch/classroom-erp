# BFAR module (Basic Financial Accounting and Reporting)

A fourth, standalone module in this repo, for Prof. Win Ballada's course. It does not touch the Standard, Manufacturing or AIS editions: no database, no tenants, no `AppShell`, no session. Routes live under `/bfar` (`src/app/bfar`), code under `src/bfar`. The only shared file it changes is the card on `src/app/choose/page.tsx`.

## Rules that must not break

- **Money is integer centavos** (₱1.00 = 100). Never use floats for amounts. Rounding is half away from zero (`roundDiv`, `percentOf` in `lib/currency.ts`). Dates are ISO `YYYY-MM-DD`.
- **Double entry:** every entry has ΣDr = ΣCr; the message is `Debits (₱X) do not equal Credits (₱Y)`. A line is a debit or a credit, never both. All student input goes through the Zod schemas in `core/journalizer.ts`.
- **Normal balances:** assets, expenses, Drawing = debit; liabilities, equity, revenues = credit. Contra accounts (110-A, 160-A, 170-A, 421, 422, 502, 503) carry the opposite balance of the account they offset.
- **Prepaids:** asset method (debit Prepaid; adjust the EXPIRED part) vs expense method (debit Expense; adjust the UNEXPIRED part). **Unearned:** liability method (adjust the EARNED part) vs income method (adjust the UNEARNED part). Only accruals, expense-method prepaids and income-method unearned are reversed (`reversing-engine.ts`).
- **Depreciation** is straight-line, (cost − salvage) ÷ life. **Uncollectibles** use a percentage of receivables or aging, net of the existing allowance.
- **Worksheet** has 10 columns. Net income: Dr column 7 and Cr column 10. Net loss: Cr column 8 and Dr column 9. Under the periodic system the ending inventory is a credit in column 8 and a debit in column 9, on the same line as the beginning inventory.
- **Closing (REID):** revenue → Income Summary, expenses → Income Summary, Income Summary → Capital, Drawing → Capital. Periodic inventory: debit ending inventory in entry 1, credit beginning in entry 2.
- **Statements** follow PAS 1: single underline on subtotals, double underline (`border-b-4 border-double`) on totals.

## Layout

- `core/`: pure functions, no React. `types`, `chart-of-accounts` (Ballada codes; 505 Cost of Goods Sold is added for perpetual only), `journalizer`, `ledger-posting`, `trial-balance`, `adjustments-engine`, `worksheet-engine`, `closing-engine`, `post-closing-tb`, `reversing-engine`, `statements-generator`, `evaluator` (validates against the key, hints, key hidden unless instructor mode).
- `practice-sets/`: Set A CleanPro (service) and Set B Metro Hardware (merchandising, periodic), each with the solution key and the expected totals the tests check.
- `store/useAccountingStore.ts`: Zustand with `persist` (`bfar-accounting-v1`, `skipHydration`). Pages render stored data only after `useHydrated()`.
- `components/`, `src/app/bfar/*`: UI.

## Tests

`npm run test:bfar` (Vitest, config in `vitest.config.ts`, files in `src/bfar/__tests__`). The repo's existing `npm test` (node:test under `tests/`) is separate and unaffected. `npm run typecheck` for types.
