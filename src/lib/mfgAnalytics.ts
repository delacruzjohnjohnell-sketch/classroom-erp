// Helpers for the Manufacturing analytics and class-comparison screens: names for the variance kinds, the month grid,
// date ranges, and small numbers for the bar charts. No database, no React.

export type TrendRow = { month_start: string; bucket: string; amount: number };
export type CurveRow = { lot_size: number; material: number; labor: number; machine: number; var_oh: number; fix_oh: number; unit_cost: number };

export const BUCKET_ORDER = ["PPV", "MATERIAL", "LABOR_EFF", "LABOR_RATE", "MACHINE_OH", "FIXED_OH", "SCRAP", "LOT_MIX"] as const;
export const BUCKET_LABEL: Record<string, string> = {
  PPV: "Purchase price", MATERIAL: "Material usage", LABOR_EFF: "Labor efficiency", LABOR_RATE: "Labor rate",
  MACHINE_OH: "Machine and variable overhead", FIXED_OH: "Fixed overhead", SCRAP: "Scrap and rework loss", LOT_MIX: "Lot size and mix",
};
export const BUCKET_HELP: Record<string, string> = {
  PPV: "Paid more (or less) per unit than the standard price when goods were received.",
  MATERIAL: "Used more (or less) material than the recipe allows for the good units.",
  LABOR_EFF: "Took more (or less) labor time than the routing allows.",
  LABOR_RATE: "Paid workers a different wage from the planned rate. Appears at month end.",
  MACHINE_OH: "Machine time and variable overhead, actual against standard.",
  FIXED_OH: "Fixed overhead absorbed against what the hours allowed.",
  SCRAP: "Cost of units thrown away.",
  LOT_MIX: "Cost differences from the lot size or product mix.",
};
export const BUCKET_COLOR: Record<string, string> = {
  PPV: "#5AA9FF", MATERIAL: "#F2B13C", LABOR_EFF: "#22D3C5", LABOR_RATE: "#9B7BFF", MACHINE_OH: "#FF8A5B", FIXED_OH: "#7F8EA0", SCRAP: "#FF6B7A", LOT_MIX: "#C5D0E2",
};
export const ABC_COLOR: Record<string, string> = { A: "#FF6B7A", B: "#F2B13C", C: "#22D3C5" };
export const ABC_HELP: Record<string, string> = {
  A: "The few items that make up the first 80 % of the stock value. Count and guard these closely.",
  B: "The next 15 % of the value.",
  C: "The many small items that make up the last 5 %. Check them less often.",
};
export const CURVE_PARTS = [
  ["material", "Material", "#F2B13C"], ["labor", "Labor", "#22D3C5"], ["machine", "Machine", "#5AA9FF"], ["var_oh", "Variable overhead", "#9B7BFF"], ["fix_oh", "Fixed overhead", "#7F8EA0"],
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-01" -> "Sep 2026". */
export const monthShort = (iso: string): string => `${MONTHS[Number(iso.slice(5, 7)) - 1] ?? "?"} ${iso.slice(0, 4)}`;

const DAY = 86400000;
const ms = (d: string) => Date.parse(d + "T00:00:00Z");
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);

export type RangeKey = "last_month" | "this_month" | "last_90" | "year";
export const RANGE_LABEL: Record<RangeKey, string> = { last_month: "Last month", this_month: "This month so far", last_90: "Last 90 days", year: "This year so far" };

/** The dates a named range covers, as of `today` (an ISO date). */
export function rangeOf(key: RangeKey, today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  if (key === "this_month") return { from: `${today.slice(0, 7)}-01`, to: today };
  if (key === "last_month") {
    const first = new Date(Date.UTC(y, m - 2, 1));
    const last = new Date(Date.UTC(y, m - 1, 0));
    return { from: isoOf(first.getTime()), to: isoOf(last.getTime()) };
  }
  if (key === "year") return { from: `${y}-01-01`, to: today };
  return { from: isoOf(ms(today) - 89 * DAY), to: today };
}

/** "1, 10, 50" or "1 10 50" -> [1, 10, 50]; anything that is not a positive number is dropped; duplicates removed; at most 12. */
export function parseLots(text: string): number[] {
  const out: number[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const n = Number(part);
    if (part !== "" && Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b).slice(0, 12);
}

/** The trend rows as a month-by-kind grid. Months run oldest to newest; only kinds that have a figure anywhere are listed. */
export function pivotTrend(rows: TrendRow[]): { months: string[]; buckets: string[]; cell: (m: string, b: string) => number; total: (m: string) => number; grand: number } {
  const months = Array.from(new Set(rows.map((r) => r.month_start))).sort();
  const seen = new Set(rows.filter((r) => Math.abs(Number(r.amount)) > 0.004).map((r) => r.bucket));
  const buckets = BUCKET_ORDER.filter((b) => seen.has(b)) as string[];
  const map = new Map(rows.map((r) => [`${r.month_start}|${r.bucket}`, Number(r.amount)]));
  const cell = (m: string, b: string) => map.get(`${m}|${b}`) ?? 0;
  const total = (m: string) => buckets.reduce((s, b) => s + cell(m, b), 0);
  return { months, buckets, cell, total, grand: months.reduce((s, m) => s + total(m), 0) };
}

/** Width of a bar as a share of the largest value, never below `min` when there is something to show. */
export function barShare(value: number, max: number, min = 0): number {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.max(Math.min(value / max, 1), min);
}

/** "37.5 %" — or a dash when there is nothing to divide by. */
export const pctText = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toFixed(1)} %`);

/** How much cheaper one unit is at the biggest lot than at the smallest, as a percentage; null with fewer than two lots. */
export function curveSaving(rows: Pick<CurveRow, "lot_size" | "unit_cost">[]): number | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => a.lot_size - b.lot_size);
  const first = sorted[0].unit_cost, last = sorted[sorted.length - 1].unit_cost;
  return first > 0 ? Math.round(((first - last) / first) * 1000) / 10 : null;
}

/** On-time share of goods-receipt lines, as a percentage; null when nothing was received. */
export function onTimePct(onTime: number, late: number): number | null {
  const n = onTime + late;
  return n > 0 ? Math.round((onTime / n) * 1000) / 10 : null;
}

export type Tone = "good" | "warn" | "bad" | "muted";
/** A simple traffic light for a rate where bigger is better. */
export const rateTone = (p: number | null, good: number, warn: number): Tone => (p === null ? "muted" : p >= good ? "good" : p >= warn ? "warn" : "bad");
