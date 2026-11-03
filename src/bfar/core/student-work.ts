// What a student builds by hand after journalizing: the ledger accounts, the trial balance and the 10-column worksheet.
// Nothing here is generated for the student; amounts are kept as the raw text they typed and parsed to centavos only when graded.
import { parsePesos } from "../lib/currency";
import type { ColumnKey } from "./worksheet-engine";
import type { JournalEntry } from "./types";

/** "free" is the student's own practice journal; any other id is a practice set. */
export const FREE_BOOK = "free";

export interface LedgerRowIn { date: string; particulars: string; pr: string; debit: string; credit: string; balance: string }
export interface LedgerAccountIn { code: string; rows: LedgerRowIn[]; debitFooting: string; creditFooting: string; balance: string; side: "Dr" | "Cr" | "" }
export interface TbRowIn { code: string; debit: string; credit: string }
export interface TrialBalanceIn { rows: TbRowIn[]; totalDebit: string; totalCredit: string }
export interface WsRowIn { code: string; adj: string; cells: Partial<Record<ColumnKey, string>> }
/** `subtotals` are the column totals before the net income line; `net` holds the net income or loss in the Income Statement and Balance Sheet columns; `totals` are the final totals. */
export interface WorksheetIn { rows: WsRowIn[]; subtotals: Partial<Record<ColumnKey, string>>; net: Partial<Record<ColumnKey, string>>; totals: Partial<Record<ColumnKey, string>> }
export interface StudentWork { ledger: LedgerAccountIn[]; tb: TrialBalanceIn; worksheet: WorksheetIn }

export const emptyWork = (): StudentWork => ({ ledger: [], tb: { rows: [], totalDebit: "", totalCredit: "" }, worksheet: { rows: [], subtotals: {}, net: {}, totals: {} } });
export const emptyLedgerRow = (): LedgerRowIn => ({ date: "", particulars: "", pr: "", debit: "", credit: "", balance: "" });
export const emptyLedgerAccount = (code: string): LedgerAccountIn => ({ code, rows: [emptyLedgerRow(), emptyLedgerRow(), emptyLedgerRow()], debitFooting: "", creditFooting: "", balance: "", side: "" });

/** Typed text to centavos; blank or unreadable counts as zero. */
export const amt = (s: string | undefined): number => parsePesos(s ?? "") ?? 0;

export const hasWork = (w: StudentWork | undefined): boolean => !!w && (w.ledger.length > 0 || w.tb.rows.length > 0 || w.worksheet.rows.length > 0);

/** The journal entries that belong to one book: a practice set's (ids start with the set id) or the student's free journal. */
export const entriesOfBook = (entries: JournalEntry[], book: string): JournalEntry[] =>
  entries.filter((e) => (book === FREE_BOOK ? e.id.startsWith("je-") : e.id.startsWith(`${book}-`)));

// ---- What the teacher's grading returns for the hand-built books (the numbers are centavos)
export interface LedgerCheck { code: string; opened: boolean; ok: boolean; expected: { debitFooting: number; creditFooting: number; balance: number; side: "Dr" | "Cr" }; got: { debitFooting: number; creditFooting: number; balance: number; side: string } }
export interface TbCheck { code: string; listed: boolean; ok: boolean; expected: { debit: number; credit: number }; got: { debit: number; credit: number } }
export interface WsCheck { code: string; listed: boolean; ok: boolean; expected: Record<ColumnKey, number>; got: Record<ColumnKey, number>; expectedAdj: string[]; gotAdj: string[] }
export interface WorkMarking {
  ledger: LedgerCheck[]; tb: TbCheck[]; tbTotalsOk: boolean; worksheet: WsCheck[]; worksheetTotalsOk: boolean;
  /** Accounts the student entered that the key does not have. */
  extra: { ledger: string[]; tb: string[]; worksheet: string[] };
  expectedTotals: { tbDebit: number; tbCredit: number; worksheet: Record<ColumnKey, number> };
}
