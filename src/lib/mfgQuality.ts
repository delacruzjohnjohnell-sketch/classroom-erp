// Form rules and small helpers for the Manufacturing quality screens (inspection plans, results, decisions).
// The database re-checks everything; these checks give a student a plain message before anything is sent.
import { z } from "zod";

const num = (label: string) => z.coerce.number({ error: `${label} must be a number.` });
const optNum = z.union([z.literal(""), z.null(), z.coerce.number()]).optional().transform((v) => (v === "" || v == null ? null : Number(v)));

export const ROOT_CAUSES: [string, string][] = [
  ["MATERIAL", "Material"], ["MACHINE", "Machine"], ["METHOD", "Method"], ["PEOPLE", "People"],
  ["MEASUREMENT", "Measurement"], ["ENVIRONMENT", "Environment"], ["SUPPLIER", "Supplier"], ["OTHER", "Other"],
];
export const ROOT_CAUSE_LABEL: Record<string, string> = Object.fromEntries(ROOT_CAUSES);

export const LOT_STATUS_LABEL: Record<string, string> = { CREATED: "Waiting", IN_INSPECTION: "Being inspected", DECIDED: "Decided", CANCELLED: "Cancelled" };
export const LOT_STATUS_TONE: Record<string, "good" | "warn" | "muted" | "bad"> = { CREATED: "warn", IN_INSPECTION: "warn", DECIDED: "good", CANCELLED: "muted" };
export const DECISION_LABEL: Record<string, string> = { ACCEPT: "Accepted", SCRAP: "Scrapped", RETURN: "Returned to vendor", REWORK: "Sent for rework", SPLIT: "Split" };
export const SOURCE_LABEL: Record<string, string> = { GR: "Goods received", PRODUCTION: "Made in production", REWORK: "After rework" };

/** Is a measured value inside the specification? A missing minimum or maximum means no limit on that side. */
export function inSpec(value: number, min: number | null | undefined, max: number | null | undefined): boolean {
  return (min == null || value >= min) && (max == null || value <= max);
}

/** "8 – 12 %", "at least 100 mm", "at most 5". */
export function specText(min: number | null | undefined, max: number | null | undefined, unit?: string | null): string {
  const u = unit ? ` ${unit}` : "";
  const f = (n: number) => Number(n).toLocaleString("en-PH", { maximumFractionDigits: 4 });
  if (min != null && max != null) return `${f(min)} – ${f(max)}${u}`;
  if (min != null) return `at least ${f(min)}${u}`;
  if (max != null) return `at most ${f(max)}${u}`;
  return "—";
}

export const planRowsSchema = z.array(z.object({
  characteristic: z.string().trim().min(1, "Name every characteristic."),
  unit: z.string().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
  spec_min: optNum,
  spec_max: optNum,
})).superRefine((rows, ctx) => {
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const key = r.characteristic.toLowerCase();
    if (seen.has(key)) ctx.addIssue({ code: "custom", message: `"${r.characteristic}" is listed twice.` });
    seen.add(key);
    if (r.spec_min == null && r.spec_max == null) ctx.addIssue({ code: "custom", message: `Line ${i + 1} (${r.characteristic}): enter a minimum, a maximum, or both.` });
    if (r.spec_min != null && r.spec_max != null && r.spec_min > r.spec_max) ctx.addIssue({ code: "custom", message: `Line ${i + 1} (${r.characteristic}): the minimum can't be above the maximum.` });
  });
});

export const resultsSchema = z.array(z.object({
  characteristic: z.string().min(1),
  value: num("A measured value"),
})).min(1, "Enter at least one measured value.");

export type DecisionInput = { lotQty: number; accept: string; scrap: string; ret: string; rework: string; cause: string; note: string; outOfSpec: number; missing: number; canReturn: boolean };

/** The same checks the database makes, as one plain sentence, or null when the decision is fine. */
export function checkDecision(d: DecisionInput): string | null {
  const q = [d.accept, d.scrap, d.ret, d.rework].map((x) => (x === "" ? 0 : Number(x)));
  if (q.some((x) => Number.isNaN(x))) return "Every quantity must be a number.";
  if (q.some((x) => x < 0)) return "A quantity can't be negative.";
  const total = Math.round(q.reduce((s, x) => s + x, 0) * 1e6) / 1e6;
  if (Math.abs(total - d.lotQty) > 0.000001) return `The quantities must add up to the whole lot: the lot holds ${d.lotQty} and you entered ${total}.`;
  if (d.missing > 0) return `Record the result of every characteristic first (${d.missing} still missing).`;
  if (q[0] > 0 && d.outOfSpec > 0 && d.note.trim().length < 3) return `${d.outOfSpec} result${d.outOfSpec === 1 ? " is" : "s are"} outside the specification. Say why you accept the goods.`;
  if (q[1] + q[2] + q[3] > 0 && !d.cause) return "Choose the root cause of the rejection.";
  if (q[2] > 0 && !d.canReturn) return "Only goods bought from a vendor can be returned to the vendor.";
  return null;
}

/** "Scrap 2 · Return 1" style summary of what a decision did. */
export function decisionSummary(l: { qty_accept: number; qty_scrap: number; qty_return: number; qty_rework: number }): string {
  const f = (n: number) => Number(n).toLocaleString("en-PH", { maximumFractionDigits: 4 });
  return [["Accepted", l.qty_accept], ["Scrapped", l.qty_scrap], ["Returned", l.qty_return], ["Rework", l.qty_rework]]
    .filter(([, n]) => Number(n) > 0).map(([k, n]) => `${k} ${f(Number(n))}`).join(" · ");
}
