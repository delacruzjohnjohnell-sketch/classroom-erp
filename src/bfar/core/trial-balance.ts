// Builds a trial balance from the ledger: each account's balance goes to its debit or credit column, and the two columns must agree.
import type { LedgerAccount, TrialBalance, TrialBalanceRow } from "./types";
import { sum } from "../lib/currency";

export function trialBalance(ledger: LedgerAccount[]): TrialBalance {
  const rows: TrialBalanceRow[] = ledger
    .filter((l) => l.balance !== 0)
    .map((l) => ({ code: l.account.code, name: l.account.name, debit: l.balanceSide === "debit" ? l.balance : 0, credit: l.balanceSide === "credit" ? l.balance : 0 }));
  const totalDebit = sum(rows.map((r) => r.debit));
  const totalCredit = sum(rows.map((r) => r.credit));
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}
