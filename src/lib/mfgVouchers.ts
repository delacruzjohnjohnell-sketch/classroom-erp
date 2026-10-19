// Journal voucher form rules and labels. The database re-checks everything (mfg__voucher_check); these checks give a student a plain message
// before anything is sent, and keep the Post button off until the voucher can actually be posted.
// No imports, so the unit tests can load this file directly.

export type VoucherStatus = "DRAFT" | "PENDING_APPROVAL" | "POSTED" | "REVERSED";

export const STATUS_LABEL: Record<VoucherStatus, string> = { DRAFT: "Draft", PENDING_APPROVAL: "Waiting for approval", POSTED: "Posted", REVERSED: "Reversed" };
export const STATUS_TONE: Record<VoucherStatus, "muted" | "warn" | "good" | "bad"> = { DRAFT: "muted", PENDING_APPROVAL: "warn", POSTED: "good", REVERSED: "bad" };

export const JV_TYPES = [
  ["GENERAL", "General / adjusting"], ["ACCRUAL", "Accrual"], ["DEPRECIATION", "Depreciation"], ["RECLASSIFICATION", "Reclassification"], ["REVERSING", "Reversing entry"],
] as const;
export const jvTypeLabel = (t: string | null | undefined) => JV_TYPES.find((x) => x[0] === t)?.[1] ?? "General / adjusting";

export type DraftLine = { account_id: string; debit: string; credit: string; cost_center_id: string; order_id: string; description: string };
export const blankLine = (): DraftLine => ({ account_id: "", debit: "", credit: "", cost_center_id: "", order_id: "", description: "" });
export const blankLines = (): DraftLine[] => [blankLine(), blankLine()];

const num = (s: string) => {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Typing a debit zeroes the credit on that line, and the other way round. */
export function typeAmount(line: DraftLine, side: "debit" | "credit", value: string): DraftLine {
  const other = side === "debit" ? "credit" : "debit";
  return { ...line, [side]: value, [other]: num(value) > 0 ? "" : line[other] };
}

export type Totals = { debit: number; credit: number; diff: number; filled: number; balanced: boolean };
export function totals(lines: DraftLine[]): Totals {
  const used = lines.filter((l) => l.account_id && (num(l.debit) > 0 || num(l.credit) > 0));
  const debit = r2(used.reduce((s, l) => s + num(l.debit), 0));
  const credit = r2(used.reduce((s, l) => s + num(l.credit), 0));
  const diff = r2(debit - credit);
  return { debit, credit, diff, filled: used.length, balanced: Math.abs(diff) < 0.005 };
}

/** A line with an amount but no account, which the form cannot send. */
export const lineWithoutAccount = (lines: DraftLine[]) => lines.findIndex((l) => !l.account_id && (num(l.debit) > 0 || num(l.credit) > 0));

export type Verdict = { ok: boolean; reason: string | null };
export function canPost(lines: DraftLine[], opts: { override: boolean; overrideReason: string; controlUsed: boolean }): Verdict {
  const t = totals(lines);
  const bad = lineWithoutAccount(lines);
  if (bad >= 0) return { ok: false, reason: `Line ${bad + 1} has an amount but no account.` };
  if (t.filled < 2) return { ok: false, reason: "Enter at least two lines with an account and an amount." };
  if (!t.balanced) return { ok: false, reason: `Debits and credits differ by ${Math.abs(t.diff).toLocaleString("en-PH", { minimumFractionDigits: 2 })}.` };
  if (t.debit <= 0) return { ok: false, reason: "The total must be above zero." };
  if (opts.controlUsed && !opts.override) return { ok: false, reason: "A control account is used. Tick “system override / audit adjustment” and give a reason, or use the operational screen." };
  if (opts.override && opts.overrideReason.trim().length < 10) return { ok: false, reason: "An override needs a reason of at least ten characters." };
  return { ok: true, reason: null };
}

// The control accounts a Manufacturing company starts with. The database decides for real (it follows the company's account settings);
// this only warns early.
export const CONTROL_CODES = ["1100", "1200", "1210", "1220", "1230", "2000", "2050", "5700", "5710", "5720"];
export const isControlCode = (code: string | null | undefined) => !!code && CONTROL_CODES.includes(code);

/** The draft lines as the database function expects them. Empty lines are left out. */
export function linesForSave(lines: DraftLine[]) {
  return lines.filter((l) => l.account_id || num(l.debit) > 0 || num(l.credit) > 0)
    .map((l) => ({ account_id: l.account_id, debit: num(l.debit), credit: num(l.credit), cost_center_id: l.cost_center_id || null, order_id: l.order_id || null, description: l.description.trim() || null }));
}

/** What the voucher register offers as a filter. */
export const KIND_LABEL: Record<string, string> = { MANUAL: "Prepared by a person", SYSTEM: "Posted by a document" };
