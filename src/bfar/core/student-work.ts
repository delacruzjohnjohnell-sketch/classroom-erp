// What a student builds by hand after journalizing: the ledger accounts, the trial balance and the 10-column worksheet.
// Nothing here is generated for the student; amounts are kept as the raw text they typed and parsed to centavos only when graded.
import { accountOrder, getAccount } from "./chart-of-accounts";
import { parsePesos, sum } from "../lib/currency";
import type { ColumnKey } from "./worksheet-engine";
import type { JournalEntry } from "./types";

/** "free" is the student's own practice journal; any other id is a practice set. */
export const FREE_BOOK = "free";

/** One journal line the student dropped into a ledger account: `ref` is "<entry id>#<line index>", `side` is the half of the account it was dropped on. */
export interface PostedLine { ref: string; side: "Dr" | "Cr" }
/** A ledger account the student opened: the lines posted to it, what they typed for the running balances, footings and ending balance. */
export interface LedgerAccountIn { code: string; posted: PostedLine[]; runBalances: Record<string, string>; debitFooting: string; creditFooting: string; balance: string; side: "Dr" | "Cr" | "" }
export interface WsRowIn { code: string; adj: string; cells: Partial<Record<ColumnKey, string>> }
/** `subtotals` are the column totals before the net income line; `net` holds the net income or loss in the Income Statement and Balance Sheet columns; `totals` are the final totals. */
export interface WorksheetIn { rows: WsRowIn[]; subtotals: Partial<Record<ColumnKey, string>>; net: Partial<Record<ColumnKey, string>>; totals: Partial<Record<ColumnKey, string>> }
/** The trial balance is not part of it: it is generated from the student's own ledger (see `generateTrialBalance`). */
export interface StudentWork { ledger: LedgerAccountIn[]; worksheet: WorksheetIn }

export const emptyWork = (): StudentWork => ({ ledger: [], worksheet: { rows: [], subtotals: {}, net: {}, totals: {} } });
export const emptyLedgerAccount = (code: string): LedgerAccountIn => ({ code, posted: [], runBalances: {}, debitFooting: "", creditFooting: "", balance: "", side: "" });

/** The reference of one line of one journal entry, the unit that is dragged. */
export const lineRef = (entryId: string, index: number) => `${entryId}#${index}`;

/** Typed text to centavos; blank or unreadable counts as zero. */
export const amt = (s: string | undefined): number => parsePesos(s ?? "") ?? 0;

export const hasWork = (w: StudentWork | undefined): boolean => !!w && (w.ledger.length > 0 || w.worksheet.rows.length > 0);

/** The journal entries that belong to one book: a practice set's (ids start with the set id) or the student's free journal. */
export const entriesOfBook = (entries: JournalEntry[], book: string): JournalEntry[] =>
  entries.filter((e) => (book === FREE_BOOK ? e.id.startsWith("je-") : e.id.startsWith(`${book}-`)));

// ---- What the teacher's grading returns for the hand-built books (the numbers are centavos)
export interface LedgerCheck { code: string; opened: boolean; ok: boolean; expected: { debitFooting: number; creditFooting: number; balance: number; side: "Dr" | "Cr" }; got: { debitFooting: number; creditFooting: number; balance: number; side: string } }
export interface WsCheck { code: string; listed: boolean; ok: boolean; expected: Record<ColumnKey, number>; got: Record<ColumnKey, number>; expectedAdj: string[]; gotAdj: string[] }
/** How one journal line was posted: to the right account and side, the wrong one, or not at all. `no-line` means the student's journal has no such line to post. */
export interface PostingCheck { entryId: string; accountCode: string; side: "Dr" | "Cr"; amount: number; status: "ok" | "wrong-account" | "wrong-side" | "not-posted" | "no-line"; postedTo?: string; postedSide?: string }
export interface WorkMarking {
  posting: PostingCheck[];
  ledger: LedgerCheck[]; worksheet: WsCheck[]; worksheetTotalsOk: boolean;
  /** Accounts the student entered that the key does not have. */
  extra: { ledger: string[]; worksheet: string[] };
  expectedTotals: { worksheet: Record<ColumnKey, number> };
}

// ---- The trial balance is generated from what the student posted
export interface GeneratedTrialBalance { rows: { code: string; name: string; debit: number; credit: number }[]; totalDebit: number; totalCredit: number; balanced: boolean; unpostedLines: number }

/** The trial balance of the student's own ledger: each account's posted debits less posted credits, in the debit or credit column. Mistakes in posting show up as an unbalanced trial balance. */
export function generateTrialBalance(ledger: LedgerAccountIn[], entries: JournalEntry[]): GeneratedTrialBalance {
  const amounts = new Map<string, number>();
  for (const e of entries.filter((x) => x.stage === "transaction")) e.lines.forEach((l, i) => amounts.set(lineRef(e.id, i), l.debit || l.credit));
  const rows = ledger.map((a) => {
    const net = sum(a.posted.map((p) => (amounts.get(p.ref) ?? 0) * (p.side === "Dr" ? 1 : -1)));
    return { code: a.code, name: getAccount(a.code)?.name ?? a.code, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
  }).filter((r) => r.debit !== 0 || r.credit !== 0).sort((x, y) => accountOrder(x.code) - accountOrder(y.code));
  const totalDebit = sum(rows.map((r) => r.debit)), totalCredit = sum(rows.map((r) => r.credit));
  const posted = new Set(ledger.flatMap((a) => a.posted.map((p) => p.ref)));
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit, unpostedLines: [...amounts.keys()].filter((r) => !posted.has(r)).length };
}
