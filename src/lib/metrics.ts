import { round2 } from "./types";
import type { Account, JournalLine } from "./types";

export type EntryWithLines = { id: string; entry_date: string; memo: string | null; journal_lines: JournalLine[] };

export function computeAccountBalances(entries: EntryWithLines[]) {
  const bal: Record<string, number> = {};
  for (const e of entries) for (const l of e.journal_lines) {
    bal[l.account_id] = (bal[l.account_id] || 0) + (l.debit || 0) - (l.credit || 0);
  }
  return bal;
}

export function computeMetrics(accounts: Account[], entries: EntryWithLines[], inventoryValue: number, headcount: number) {
  const bal = computeAccountBalances(entries);
  const typeById = Object.fromEntries(accounts.map((a) => [a.id, a.type]));
  const cashId = accounts.find((a) => a.code === "1000")?.id;
  let revenue = 0, expenses = 0, cash = 0;
  for (const [id, v] of Object.entries(bal)) {
    const t = typeById[id];
    if (t === "revenue") revenue += -v;
    if (t === "expense") expenses += v;
    if (id === cashId) cash = v;
  }
  return { revenue, expenses, netIncome: revenue - expenses, cash, inventoryValue, headcount };
}

export function buildMonthlySeries(accounts: Account[], entries: EntryWithLines[], code: string) {
  const accountId = accounts.find((a) => a.code === code)?.id;
  const byMonth: Record<string, number> = {};
  for (const e of entries) for (const l of e.journal_lines) {
    if (l.account_id === accountId && l.credit) {
      const key = e.entry_date.slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + l.credit;
    }
  }
  return Object.entries(byMonth).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => ({
    label: new Date(k + "-01").toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    value: round2(v),
  }));
}

export function buildExpenseBreakdown(accounts: Account[], entries: EntryWithLines[]) {
  const byAccount: Record<string, number> = {};
  const nameById = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const typeById = Object.fromEntries(accounts.map((a) => [a.id, a.type]));
  for (const e of entries) for (const l of e.journal_lines) {
    if (typeById[l.account_id] === "expense" && l.debit) byAccount[l.account_id] = (byAccount[l.account_id] || 0) + l.debit;
  }
  return Object.entries(byAccount).map(([id, v]) => ({ name: nameById[id], value: round2(v) }));
}
