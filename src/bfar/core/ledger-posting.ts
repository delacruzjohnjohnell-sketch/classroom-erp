// Posts journal entries to the general ledger: 4-column rows with running balances and T-account footings.
import { accountOrder, requireAccount } from "./chart-of-accounts";
import { journalRef } from "./journalizer";
import type { Account, JournalEntry, LedgerAccount, LedgerRow, NormalBalance } from "./types";

export type Stage = JournalEntry["stage"];
export const ALL_STAGES: Stage[] = ["transaction", "adjusting", "closing", "reversing"];

/** The posting reference of each entry (GJ1, SJ2, ...), numbered per journal in date order. */
export function entryRefs(entries: JournalEntry[], stages: Stage[] = ALL_STAGES): Map<string, string> {
  const counts = new Map<string, number>();
  const refs = new Map<string, string>();
  const use = entries.map((e, i) => ({ e, i })).filter((x) => stages.includes(x.e.stage)).sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i);
  for (const { e } of use) {
    const n = (counts.get(e.kind) ?? 0) + 1;
    counts.set(e.kind, n);
    refs.set(e.id, `${journalRef(e.kind)}${n}`);
  }
  return refs;
}

/** Posts the entries (in date order, then entry order) into one ledger account per code used. */
export function postToLedger(entries: JournalEntry[], stages: Stage[] = ["transaction"]): LedgerAccount[] {
  const use = entries.map((e, i) => ({ e, i })).filter((x) => stages.includes(x.e.stage)).sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i);
  const counts = new Map<string, number>();
  const accounts = new Map<string, { account: Account; rows: LedgerRow[]; run: number; d: number; c: number }>();
  for (const { e } of use) {
    const n = (counts.get(e.kind) ?? 0) + 1;
    counts.set(e.kind, n);
    const ref = `${journalRef(e.kind)}${n}`;
    for (const l of e.lines) {
      const acc = requireAccount(l.accountCode);
      const cur = accounts.get(acc.code) ?? { account: acc, rows: [], run: 0, d: 0, c: 0 };
      cur.run += acc.normal === "debit" ? l.debit - l.credit : l.credit - l.debit;
      cur.d += l.debit; cur.c += l.credit;
      cur.rows.push({ date: e.date, explanation: e.explanation, ref, debit: l.debit, credit: l.credit, balance: cur.run, side: acc.normal });
      accounts.set(acc.code, cur);
    }
  }
  return [...accounts.values()]
    .map(({ account, rows, run, d, c }): LedgerAccount => {
      const side: NormalBalance = run < 0 ? (account.normal === "debit" ? "credit" : "debit") : account.normal;
      return { account, rows, debitTotal: d, creditTotal: c, balance: Math.abs(run), balanceSide: side };
    })
    .sort((a, b) => accountOrder(a.account.code) - accountOrder(b.account.code));
}

export interface TAccount { name: string; code: string; debits: { date: string; amount: number }[]; credits: { date: string; amount: number }[]; debitFooting: number; creditFooting: number; balance: number; balanceSide: NormalBalance }

/** The T-account view: debit amounts left, credit amounts right, with footings and the ending balance. */
export function toTAccount(l: LedgerAccount): TAccount {
  const debits = l.rows.filter((r) => r.debit > 0).map((r) => ({ date: r.date, amount: r.debit }));
  const credits = l.rows.filter((r) => r.credit > 0).map((r) => ({ date: r.date, amount: r.credit }));
  return { name: l.account.name, code: l.account.code, debits, credits, debitFooting: l.debitTotal, creditFooting: l.creditTotal, balance: l.balance, balanceSide: l.balanceSide };
}

/** The balance in the account's normal direction (negative when it is abnormal). */
export const balanceOf = (ledger: LedgerAccount[], code: string): number => {
  const l = ledger.find((x) => x.account.code === code);
  if (!l) return 0;
  return l.balanceSide === l.account.normal ? l.balance : -l.balance;
};
