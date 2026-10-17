// Month-end helpers for the Period End screen: month names, the way a statement shows a negative number,
// and how the database's check rows are grouped. No database, no React.

export type PeriodStatus = "OPEN" | "SETTLED" | "CLOSED";
export type PeriodRow = {
  period_start: string; period_end: string; status: PeriodStatus; entries: number; settled_at: string | null; closed_at: string | null;
  to_cogs: number; to_wip: number; to_fg: number;
};
export type PeriodCheck = { code: string; severity: "block" | "warn" | "info"; message: string; n: number };
export type StatementLine = { key: string; label: string; amount: number; kind: "line" | "sub" | "total"; source?: "ledger" | "documents"; note?: string };
export type TieOut = { key: string; label: string; a: number; b: number; diff: number };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11-01" -> "November 2026". */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

/** The first day of the month an ISO date falls in. */
export const monthStart = (iso: string): string => iso.slice(0, 7) + "-01";

/** The last day of the month an ISO date falls in. */
export function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** A statement shows money without a sign and puts a deduction in brackets: -2936 -> "(2,936.00)". */
export function acct(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "—";
  const s = Math.abs(v).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v < -0.004 ? `(${s})` : s;
}

/** Anything the database says must be fixed before the month can be settled. */
export const blocks = (checks: PeriodCheck[]): PeriodCheck[] => checks.filter((c) => c.severity === "block");
export const warnings = (checks: PeriodCheck[]): PeriodCheck[] => checks.filter((c) => c.severity === "warn");
export const infos = (checks: PeriodCheck[]): PeriodCheck[] => checks.filter((c) => c.severity === "info");

export const STATUS_LABEL: Record<PeriodStatus, string> = { OPEN: "Open", SETTLED: "Settled — not yet closed", CLOSED: "Closed" };
export const STATUS_TONE: Record<PeriodStatus, "muted" | "warn" | "good"> = { OPEN: "muted", SETTLED: "warn", CLOSED: "good" };

/** A tie-out line is fine when the two sides agree to within a few centavos of rounding. */
export const tiesOut = (t: Pick<TieOut, "diff">): boolean => Math.abs(Number(t.diff)) < 0.1;

/**
 * Which button a month offers. Months are done oldest first: an open month can be settled only when every older month that has
 * activity is closed (the database checks this too and says why), and a settled month can be closed once the older ones are.
 */
export function monthAction(rows: PeriodRow[], start: string): "settle" | "close" | "none" {
  const row = rows.find((r) => r.period_start === start);
  if (!row || row.status === "CLOSED") return "none";
  const olderNotClosed = rows.some((r) => r.period_start < start && r.status !== "CLOSED" && (r.entries > 0 || r.status === "SETTLED"));
  if (olderNotClosed) return "none";
  return row.status === "SETTLED" ? "close" : "settle";
}

/** The variance share going to each place, as a sentence for the preview. */
export function allocationText(method: "COGS" | "PRORATE", wip: number, fg: number, cogs: number): string {
  if (method === "COGS") return `All of it goes to cost of goods sold (${acct(cogs)}).`;
  return `Shared out by what each holds at the month end: work in process ${acct(wip)}, finished goods ${acct(fg)}, cost of goods sold ${acct(cogs)}.`;
}
