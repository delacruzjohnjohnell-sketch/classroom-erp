// OEE (overall equipment effectiveness) for the shop-floor screens: add the database's hours and counts together, then work out the ratios.
// No database, no React.

export type OeeRow = {
  work_center_id: string; bucket_no: number; bucket_start: string; scheduled_h: number; planned_stop_h: number; planned_h: number; downtime_h: number;
  setup_h: number; run_h: number; ideal_h: number; good_qty: number; scrap_qty: number;
};

export type OeeTotals = { scheduled: number; plannedStop: number; planned: number; downtime: number; setup: number; run: number; ideal: number; good: number; scrap: number };
export type Oee = { availability: number | null; performance: number | null; quality: number | null; oee: number | null };
export type OeeTone = "world" | "typical" | "low" | "none";

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Several columns (or several work centres) added together. */
export function totals(rows: Pick<OeeRow, "scheduled_h" | "planned_stop_h" | "planned_h" | "downtime_h" | "setup_h" | "run_h" | "ideal_h" | "good_qty" | "scrap_qty">[]): OeeTotals {
  const t: OeeTotals = { scheduled: 0, plannedStop: 0, planned: 0, downtime: 0, setup: 0, run: 0, ideal: 0, good: 0, scrap: 0 };
  for (const r of rows) {
    t.scheduled += Number(r.scheduled_h); t.plannedStop += Number(r.planned_stop_h); t.planned += Number(r.planned_h); t.downtime += Number(r.downtime_h);
    t.setup += Number(r.setup_h); t.run += Number(r.run_h); t.ideal += Number(r.ideal_h); t.good += Number(r.good_qty); t.scrap += Number(r.scrap_qty);
  }
  return { scheduled: r4(t.scheduled), plannedStop: r4(t.plannedStop), planned: r4(t.planned), downtime: r4(t.downtime), setup: r4(t.setup), run: r4(t.run), ideal: r4(t.ideal), good: r4(t.good), scrap: r4(t.scrap) };
}

/**
 * Availability = (planned time − downtime − set-up) ÷ planned time; performance = ideal hours ÷ hours run;
 * quality = good ÷ (good + scrap); OEE = the three multiplied. A ratio with nothing to divide by is null, and so is the OEE.
 */
export function oeeOf(t: OeeTotals): Oee {
  const availability = t.planned > 0 ? Math.max(t.planned - t.downtime - t.setup, 0) / t.planned : null;
  const performance = t.run > 0 ? t.ideal / t.run : null;
  const quality = t.good + t.scrap > 0 ? t.good / (t.good + t.scrap) : null;
  const oee = availability !== null && performance !== null && quality !== null ? availability * performance * quality : null;
  return { availability, performance, quality, oee };
}

/** 0.6903 -> "69.0 %"; null -> "—". */
export const pct = (x: number | null): string => (x === null ? "—" : `${(Math.round(x * 1000) / 10).toFixed(1)} %`);

/** 85 % and over is world class, 60 % and over is typical, below that has room to improve. */
export function oeeTone(oee: number | null): OeeTone {
  if (oee === null) return "none";
  return oee >= 0.85 ? "world" : oee >= 0.6 ? "typical" : "low";
}
export const OEE_TONE_COLOR: Record<OeeTone, string> = { world: "#22D3C5", typical: "#F2B13C", low: "#FF6B7A", none: "#C5D0E2" };
export const OEE_TONE_LABEL: Record<OeeTone, string> = { world: "World class (85 % and up)", typical: "Typical (60 % and up)", low: "Room to improve", none: "Not enough data" };

export type LossKind = "availability" | "performance" | "quality";
export const LOSS_LABEL: Record<LossKind, string> = { availability: "Stoppages and set-up", performance: "Running slower than the standard", quality: "Scrap" };
export const LOSS_HELP: Record<LossKind, string> = {
  availability: "The work centre stood still (breakdowns, waiting for material or people) or was being set up.",
  performance: "It ran, but took longer than the routing says it should for the units made.",
  quality: "Time was spent making units that were scrapped.",
};

/** Which loss cost the most hours, with the hours lost. Null when nothing was lost. */
export function biggestLoss(t: OeeTotals): { kind: LossKind; hours: number } | null {
  const made = t.good + t.scrap;
  const losses: { kind: LossKind; hours: number }[] = [
    { kind: "availability", hours: t.downtime + t.setup },
    { kind: "performance", hours: Math.max(t.run - t.ideal, 0) },
    { kind: "quality", hours: made > 0 ? t.ideal * (t.scrap / made) : 0 },
  ];
  const top = losses.reduce((a, b) => (b.hours > a.hours ? b : a));
  return top.hours > 0.000001 ? { kind: top.kind, hours: r4(top.hours) } : null;
}

export const DOWNTIME_CATEGORIES: [string, string, string][] = [
  ["BREAKDOWN", "Breakdown", "The machine failed."],
  ["NO_MATERIAL", "Waiting for material", "Nothing to work on."],
  ["NO_OPERATOR", "Nobody to run it", "No operator was available."],
  ["OTHER", "Other stoppage", "Any other unplanned stop."],
  ["PLANNED_STOP", "Planned stop", "Breaks and planned maintenance. Taken off the planned time, so it does not count against availability."],
];
export const DOWNTIME_LABEL: Record<string, string> = Object.fromEntries(DOWNTIME_CATEGORIES.map(([k, v]) => [k, v]));

const DAY = 86400000;
const ms = (iso: string) => Date.parse(iso + "T00:00:00Z");
/** The last `weeks` whole weeks up to and including the week of `today`: from the Monday that starts the first of them. */
export function weekRange(today: string, weeks: number): { from: string; days: number } {
  const monday = ms(today) - ((new Date(ms(today)).getUTCDay() + 6) % 7) * DAY;
  return { from: new Date(monday - (weeks - 1) * 7 * DAY).toISOString().slice(0, 10), days: weeks * 7 };
}
