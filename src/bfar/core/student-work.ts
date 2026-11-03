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
/** Where the student put an adjusting-entry line: the row of an account, in column 3 (Dr) or column 4 (Cr). `ref` is "<entry id>#<line index>" of the adjusting entry. */
export interface AdjPlacement { ref: string; code: string; side: "Dr" | "Cr" }
/** Where the student put an account's adjusted balance: the Income Statement or Balance Sheet column (7 to 10). */
export type ColTarget = "isDr" | "isCr" | "bsDr" | "bsCr";
export interface WsPlacement { code: string; to: ColTarget }
/**
 * The worksheet the student works: columns 1-2 come from the generated trial balance and 5-6 are computed from 1-4, so only the clicks are stored.
 * `extraCodes` are account rows the student added (accounts that exist only because of an adjustment); `ending` is the ending merchandise inventory typed
 * into the Income Statement credit and Balance Sheet debit cells (periodic system); subtotals, net income and totals are typed.
 */
export interface WorksheetIn {
  extraCodes: string[]; adjustments: AdjPlacement[]; placements: WsPlacement[]; ending: { isCr: string; bsDr: string };
  subtotals: Partial<Record<ColumnKey, string>>; net: Partial<Record<ColumnKey, string>>; totals: Partial<Record<ColumnKey, string>>;
}
export interface StudentWork { ledger: LedgerAccountIn[]; worksheet: WorksheetIn }

export const emptyWork = (): StudentWork => ({ ledger: [], worksheet: { extraCodes: [], adjustments: [], placements: [], ending: { isCr: "", bsDr: "" }, subtotals: {}, net: {}, totals: {} } });
export const emptyLedgerAccount = (code: string): LedgerAccountIn => ({ code, posted: [], runBalances: {}, debitFooting: "", creditFooting: "", balance: "", side: "" });

/** The reference of one line of one journal entry, the unit that is dragged. */
export const lineRef = (entryId: string, index: number) => `${entryId}#${index}`;

/** Typed text to centavos; blank or unreadable counts as zero. */
export const amt = (s: string | undefined): number => parsePesos(s ?? "") ?? 0;

export const hasWork = (w: StudentWork | undefined): boolean => !!w && (w.ledger.length > 0 || w.worksheet.adjustments.length > 0 || w.worksheet.placements.length > 0);

/** The journal entries that belong to one book: a practice set's (ids start with the set id) or the student's free journal. */
export const entriesOfBook = (entries: JournalEntry[], book: string): JournalEntry[] =>
  entries.filter((e) => (book === FREE_BOOK ? e.id.startsWith("je-") : e.id.startsWith(`${book}-`)));

// ---- What the teacher's grading returns for the hand-built books (the numbers are centavos)
export interface LedgerCheck { code: string; opened: boolean; ok: boolean; expected: { debitFooting: number; creditFooting: number; balance: number; side: "Dr" | "Cr" }; got: { debitFooting: number; creditFooting: number; balance: number; side: string } }
/** How one journal line was posted or placed: to the right account and side, the wrong one, or not at all. `no-line` means the student's journal has no such line to place. */
export interface PostingCheck { entryId: string; accountCode: string; side: "Dr" | "Cr"; amount: number; status: "ok" | "wrong-account" | "wrong-side" | "not-posted" | "no-line"; postedTo?: string; postedSide?: string }

/** How an account's adjusted balance was placed in columns 7-10 (`expectedTo`), and for merchandise inventory under the periodic system whether the typed ending inventory was right. */
export interface ColumnCheck { code: string; listed: boolean; placed: boolean; ok: boolean; expectedTo: ColTarget; gotTo?: ColTarget; endingOk?: boolean }
export interface WorkMarking {
  posting: PostingCheck[];
  ledger: LedgerCheck[];
  /** The adjusting-entry lines, placed on the right account row and in the right column (3 debit or 4 credit). */
  adjusting: PostingCheck[];
  columns: ColumnCheck[];
  /** Follow-through: the typed subtotals, net income line and totals are checked against what the student's own placements add up to. */
  footings: { subtotalsOk: boolean; netOk: boolean; totalsOk: boolean };
  /** Accounts the student entered that the key does not have. */
  extra: { ledger: string[]; worksheet: string[] };
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

// ---- The worksheet's computed columns
export interface WsComputedRow {
  code: string; name: string; tbDr: number; tbCr: number; adjDr: number; adjCr: number; atbDr: number; atbCr: number;
  isDr: number; isCr: number; bsDr: number; bsCr: number;
  /** Letters of the adjustments the student placed on this row. */
  adjTags: string[];
  to?: ColTarget;
}

/** Columns 1-6 and 7-10 as the student's own clicks make them: the trial balance from the ledger, the placed adjustment lines, the adjusted balance and where it was placed. */
export function computeWorksheet(tb: GeneratedTrialBalance, adjEntries: JournalEntry[], ws: WorksheetIn): WsComputedRow[] {
  const lines = new Map<string, { amount: number; tag: string }>();
  for (const e of adjEntries.filter((x) => x.stage === "adjusting")) e.lines.forEach((l, i) => lines.set(lineRef(e.id, i), { amount: l.debit || l.credit, tag: e.tag ?? "" }));
  const valid = ws.adjustments.filter((a) => lines.has(a.ref));
  const codes = new Set<string>([...tb.rows.map((r) => r.code), ...ws.extraCodes, ...valid.map((a) => a.code)]);
  return [...codes].map((code): WsComputedRow => {
    const t = tb.rows.find((r) => r.code === code);
    const mine = valid.filter((a) => a.code === code);
    const adjDr = sum(mine.filter((a) => a.side === "Dr").map((a) => lines.get(a.ref)!.amount));
    const adjCr = sum(mine.filter((a) => a.side === "Cr").map((a) => lines.get(a.ref)!.amount));
    const net = (t?.debit ?? 0) - (t?.credit ?? 0) + adjDr - adjCr;
    const atbDr = net > 0 ? net : 0, atbCr = net < 0 ? -net : 0;
    const to = ws.placements.find((p) => p.code === code)?.to;
    const row: WsComputedRow = { code, name: getAccount(code)?.name ?? code, tbDr: t?.debit ?? 0, tbCr: t?.credit ?? 0, adjDr, adjCr, atbDr, atbCr, isDr: 0, isCr: 0, bsDr: 0, bsCr: 0, adjTags: [...new Set(mine.map((a) => lines.get(a.ref)!.tag))].filter(Boolean), to };
    if (to) row[to] = atbDr || atbCr;
    if (code === "130") { row.isCr += amt(ws.ending.isCr); row.bsDr += amt(ws.ending.bsDr); }
    return row;
  }).sort((x, y) => accountOrder(x.code) - accountOrder(y.code));
}

/** What the typed subtotals, net income line and totals should be, given the student's own rows. */
export function worksheetFootings(rows: WsComputedRow[]): { subtotals: Record<ColumnKey, number>; net: Partial<Record<ColumnKey, number>>; totals: Record<ColumnKey, number> } {
  const keys: ColumnKey[] = ["tbDr", "tbCr", "adjDr", "adjCr", "atbDr", "atbCr", "isDr", "isCr", "bsDr", "bsCr"];
  const subtotals = Object.fromEntries(keys.map((k) => [k, sum(rows.map((r) => r[k]))])) as Record<ColumnKey, number>;
  const diff = subtotals.isCr - subtotals.isDr;
  const net: Partial<Record<ColumnKey, number>> = diff >= 0 ? { isDr: diff, bsCr: diff } : { isCr: -diff, bsDr: -diff };
  const totals = { ...subtotals };
  for (const k of ["isDr", "isCr", "bsDr", "bsCr"] as const) totals[k] += net[k] ?? 0;
  return { subtotals, net, totals };
}

// ---- Repairing saved work. The shape of the work has changed over time; anything saved in an older shape, in the browser or on the server, is made valid here.
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const record = (v: unknown): Record<string, string> => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, text(x)])) : {});

export function normalizeWork(raw: unknown): StudentWork {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const ledger = (Array.isArray(r.ledger) ? r.ledger : []).filter((a): a is Record<string, unknown> => !!a && typeof (a as Record<string, unknown>).code === "string").map((a) => ({
    code: a.code as string,
    posted: (Array.isArray(a.posted) ? a.posted : []).filter((p): p is PostedLine => !!p && typeof (p as PostedLine).ref === "string" && ((p as PostedLine).side === "Dr" || (p as PostedLine).side === "Cr")),
    runBalances: record(a.runBalances),
    debitFooting: text(a.debitFooting), creditFooting: text(a.creditFooting), balance: text(a.balance),
    side: (a.side === "Dr" || a.side === "Cr" ? a.side : "") as LedgerAccountIn["side"],
  }));
  const w = (r.worksheet && typeof r.worksheet === "object" ? r.worksheet : {}) as Record<string, unknown>;
  const ending = (w.ending && typeof w.ending === "object" ? w.ending : {}) as Record<string, unknown>;
  const targets: ColTarget[] = ["isDr", "isCr", "bsDr", "bsCr"];
  return {
    ledger,
    worksheet: {
      extraCodes: (Array.isArray(w.extraCodes) ? w.extraCodes : []).filter((c): c is string => typeof c === "string"),
      adjustments: (Array.isArray(w.adjustments) ? w.adjustments : []).filter((a): a is AdjPlacement => !!a && typeof (a as AdjPlacement).ref === "string" && typeof (a as AdjPlacement).code === "string" && ((a as AdjPlacement).side === "Dr" || (a as AdjPlacement).side === "Cr")),
      placements: (Array.isArray(w.placements) ? w.placements : []).filter((p): p is WsPlacement => !!p && typeof (p as WsPlacement).code === "string" && targets.includes((p as WsPlacement).to)),
      ending: { isCr: text(ending.isCr), bsDr: text(ending.bsDr) },
      subtotals: record(w.subtotals), net: record(w.net), totals: record(w.totals),
    },
  };
}
