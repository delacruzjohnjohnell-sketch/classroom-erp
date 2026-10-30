// Pure helpers for the AIS Accounting desk: the journal the student keys in, what the screens call things, and progress. No imports, so the unit tests
// can load this file directly. The database decides for real (ais_decide); this only keeps the form honest before it is sent.

export type PacketDoc = { type: string; fields: Record<string, string> };
export type Packet = { title?: string; date?: string; company?: string; docs: PacketDoc[] };
export type InboxRow = {
  id: string; seq: number; title: string; doc_date: string; status: "PENDING" | "POSTED" | "HELD";
  wrong_attempts: number; points: number | null; max_points: number | null;
};
export type DraftLine = { acct: string; debit: string; credit: string };
export type PostLine = { acct: string; debit: number; credit: number };
export type Control = { tag: string; label: string; hall_category: string; description: string };

export const STATUS_LABEL: Record<InboxRow["status"], string> = { PENDING: "Waiting for your decision", POSTED: "Posted", HELD: "Held" };
export const STATUS_TONE: Record<InboxRow["status"], string> = { PENDING: "#F2B13C", POSTED: "#22D3C5", HELD: "#9D7CFF" };

export const emptyLine = (): DraftLine => ({ acct: "", debit: "", credit: "" });

const num = (s: string) => {
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Only the lines the student actually filled in (an account and an amount), as the database expects them. */
export function cleanLines(lines: DraftLine[]): PostLine[] {
  return lines
    .filter((l) => l.acct.trim() && (num(l.debit) !== 0 || num(l.credit) !== 0))
    .map((l) => ({ acct: l.acct.trim(), debit: r2(num(l.debit)), credit: r2(num(l.credit)) }));
}

export function lineTotals(lines: DraftLine[]): { debit: number; credit: number; diff: number; balanced: boolean } {
  const used = cleanLines(lines);
  const debit = r2(used.reduce((s, l) => s + l.debit, 0));
  const credit = r2(used.reduce((s, l) => s + l.credit, 0));
  return { debit, credit, diff: r2(debit - credit), balanced: used.length >= 2 && debit === credit && debit > 0 };
}

export const money = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Why the Post button is not ready yet, in words ("" when it is). */
export function postProblem(lines: DraftLine[], knownAccounts: string[]): string {
  const used = cleanLines(lines);
  if (used.length < 2) return "A journal entry needs at least two lines.";
  const bothSides = used.find((l) => l.debit > 0 && l.credit > 0);
  if (bothSides) return `Account ${bothSides.acct}: a line is either a debit or a credit, not both.`;
  const negative = used.find((l) => l.debit < 0 || l.credit < 0);
  if (negative) return "Amounts cannot be negative.";
  const unknown = used.find((l) => !knownAccounts.includes(l.acct));
  if (unknown) return `Account ${unknown.acct} is not in the chart of accounts.`;
  const t = lineTotals(lines);
  if (!t.balanced) return `The entry does not balance: debits ${money(t.debit)} and credits ${money(t.credit)}.`;
  return "";
}

export function progress(rows: Pick<InboxRow, "status">[]): { total: number; decided: number; pending: number; pct: number } {
  const total = rows.length;
  const decided = rows.filter((r) => r.status !== "PENDING").length;
  return { total, decided, pending: total - decided, pct: total ? Math.round((decided / total) * 100) : 0 };
}

/** The next document still waiting, after the one being looked at (wraps round), or null when none is left. */
export function nextPending(rows: Pick<InboxRow, "id" | "seq" | "status">[], currentId?: string): string | null {
  const open = rows.filter((r) => r.status === "PENDING").sort((a, b) => a.seq - b.seq);
  if (open.length === 0) return null;
  const cur = rows.find((r) => r.id === currentId);
  const after = cur ? open.find((r) => r.seq > cur.seq) : undefined;
  return (after ?? open[0]).id;
}

/** Controls grouped by Hall's category, so the picker reads like the textbook. */
export function groupControls(controls: Control[]): { category: string; items: Control[] }[] {
  const map = new Map<string, Control[]>();
  for (const c of controls) map.set(c.hall_category, [...(map.get(c.hall_category) ?? []), c]);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([category, items]) => ({ category, items: items.sort((x, y) => x.label.localeCompare(y.label)) }));
}
