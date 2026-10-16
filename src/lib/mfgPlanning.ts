// Form rules and small helpers for the Manufacturing planning screens (MRP run, forecasts, planned orders, requisitions).
// The database re-checks everything; these checks give a student a plain message before anything is sent.
import { z } from "zod";

const num = (label: string) => z.coerce.number({ error: `${label} must be a number.` });
const pos = (label: string) => num(label).gt(0, `${label} must be above zero.`);
const nonNeg = (label: string) => num(label).min(0, `${label} can't be negative.`);
const text = (msg: string) => z.string().trim().min(1, msg);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Nov 2" for 2026-11-02. */
const shortDay = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}`; };
const dateStr = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);

export const HORIZON_OPTIONS = [
  { days: 28, label: "4 weeks" },
  { days: 56, label: "8 weeks" },
  { days: 84, label: "12 weeks" },
  { days: 182, label: "26 weeks" },
] as const;

export const BUCKET_OPTIONS = [
  { days: 7, label: "Weekly" },
  { days: 1, label: "Daily" },
  { days: 14, label: "Every 2 weeks" },
  { days: 30, label: "Monthly" },
] as const;

/** How many time columns a run will have. The database allows at most 60. */
export const bucketCount = (horizonDays: number, bucketDays: number) => Math.ceil(horizonDays / bucketDays);

export const planRunSchema = z.object({
  start: dateStr("Choose the date planning starts from."),
  horizon_days: num("The planning horizon").int("The planning horizon must be whole days.").min(7, "Plan at least 7 days ahead.").max(365, "Plan at most 365 days ahead."),
  bucket_days: num("The time bucket").refine((n) => [1, 7, 14, 30].includes(n), { message: "Choose daily, weekly, every 2 weeks or monthly." }),
  include_forecast: z.boolean(),
}).superRefine((v, ctx) => {
  const n = bucketCount(v.horizon_days, v.bucket_days);
  if (n > 60) ctx.addIssue({ code: "custom", message: `That is ${n} columns. Use longer buckets or a shorter horizon (60 at most).` });
});

/** A <input type="month"> value (2026-12) as the first day of that month. */
export const monthToDate = (m: string) => (/^\d{4}-\d{2}$/.test(m) ? `${m}-01` : m);

export const forecastSchema = z.object({
  item_id: text("Choose the item."),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Choose the month.").transform(monthToDate),
  qty: nonNeg("The forecast"),
});

export const plannedOrderSchema = z.object({
  item_id: text("Choose an item you make."),
  qty: pos("Quantity"),
  start_date: dateStr("Choose the start date."),
  finish_date: dateStr("Choose the finish date."),
}).superRefine((v, ctx) => {
  if (v.finish_date < v.start_date) ctx.addIssue({ code: "custom", message: "The finish date can't be before the start date." });
});

export const convertRequisitionsSchema = z.object({
  vendor_id: text("Choose the vendor."),
  lines: z.array(z.object({ req_id: text("A line is missing its requisition."), unit_price: nonNeg("Price") })).min(1, "Choose at least one requisition."),
});

export type GridRow = {
  bucket_no: number; bucket_start: string; projected_start: number; gross: number; scheduled: number; net: number;
  planned_receipt: number; planned_release: number; projected_end: number;
};

/** The first column where the plan had to cover a shortage, or null when stock never ran short. */
export function firstShortage(rows: GridRow[]): GridRow | null {
  return [...rows].sort((a, b) => a.bucket_no - b.bucket_no).find((r) => Number(r.net) > 0.000001) ?? null;
}

/** Column heading for a bucket: "Nov 2" for days and weeks, "Nov 2026" for months. */
export function bucketHeading(isoStart: string, bucketDays: number): string {
  if (bucketDays >= 30) {
    const [y, m] = isoStart.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  return shortDay(isoStart);
}

/** One-line summary of a run for the header: "12 weekly columns from Nov 2 · 9 items planned". */
export function runSummary(r: { start_date: string; bucket_count: number; bucket_days: number; items_planned: number }): string {
  const unit = r.bucket_days === 1 ? "daily" : r.bucket_days === 7 ? "weekly" : r.bucket_days === 14 ? "two-weekly" : "monthly";
  return `${r.bucket_count} ${unit} columns from ${shortDay(r.start_date)} · ${r.items_planned} item${r.items_planned === 1 ? "" : "s"} planned`;
}

/** A requisition's starting price: the item's planned price (per price unit), else its standard cost. */
export const suggestedPrice = (it: { planned_price?: number | null; price_unit?: number | null; standard_cost?: number | null } | undefined): string => {
  if (!it) return "0";
  const unit = Number(it.price_unit) > 0 ? Number(it.price_unit) : 1;
  const planned = Number(it.planned_price ?? 0) / unit;
  const v = planned > 0 ? planned : Number(it.standard_cost ?? 0);
  return String(Math.round(v * 10000) / 10000);
};
