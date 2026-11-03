// Optional reversing entries, dated the first day of the next period. Only these adjustments are reversed:
// accruals, prepaids recorded under the expense method, and unearned revenue recorded under the income method.
import { createEntry } from "./journalizer";
import type { AdjustmentType, JournalEntry } from "./types";

export const REVERSIBLE: AdjustmentType[] = ["accrued-expense", "accrued-revenue", "prepaid-expense", "unearned-income"];

export const isReversible = (e: JournalEntry): boolean => e.stage === "adjusting" && !!e.adjType && REVERSIBLE.includes(e.adjType);

export function reversingEntries(entries: JournalEntry[], date: string): JournalEntry[] {
  return entries.filter(isReversible).map((e) =>
    createEntry({
      date, kind: "general",
      lines: e.lines.map((l) => ({ accountCode: l.accountCode, debit: l.credit, credit: l.debit })).sort((a, b) => b.debit - a.debit),
      explanation: `To reverse adjusting entry (${e.tag ?? "?"}).`,
    }, { stage: "reversing", tag: e.tag }));
}
