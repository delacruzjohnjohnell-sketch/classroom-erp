// Geometry for the planning Gantt chart: a row per order, a bar from start to finish, week lines across the top.
// Pure functions on ISO dates (YYYY-MM-DD); the component only draws what these return. No database, no React.

export type GanttItem = {
  id: string; label: string; detail: string; kind: "order" | "planned"; start: string; end: string; status: string; late: boolean;
};

const DAY = 86400000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ms = (iso: string) => Date.parse(iso + "T00:00:00Z");
export const addDays = (iso: string, n: number) => new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);
export const dayDiff = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
const mondayOnOrBefore = (iso: string) => addDays(iso, -((new Date(ms(iso)).getUTCDay() + 6) % 7));

export type GanttRange = { start: string; days: number };

/** The dates the chart covers: from the Monday on or before the earliest start (or today) to a week after the latest finish; at least 4 weeks. */
export function ganttRange(items: Pick<GanttItem, "start" | "end">[], today: string, minDays = 28): GanttRange {
  let lo = today, hi = addDays(today, minDays - 1);
  for (const i of items) { if (i.start < lo) lo = i.start; if (i.end > hi) hi = i.end; }
  const start = mondayOnOrBefore(lo);
  const days = Math.max(minDays, dayDiff(start, hi) + 8);
  return { start, days: Math.ceil(days / 7) * 7 };
}

/** Where a bar sits: x from the left edge and a width, in pixels. A one-day order still gets a visible bar. */
export function barGeometry(i: Pick<GanttItem, "start" | "end">, rangeStart: string, pxPerDay: number): { x: number; w: number } {
  const s = dayDiff(rangeStart, i.start);
  const e = Math.max(dayDiff(rangeStart, i.end), s);
  return { x: s * pxPerDay, w: Math.max((e - s + 1) * pxPerDay, 6) };
}

/** A vertical line and label for each Monday in the range. */
export function weekMarks(range: GanttRange, pxPerDay: number): { x: number; label: string }[] {
  const out: { x: number; label: string }[] = [];
  for (let d = 0; d < range.days; d += 7) {
    const [, m, day] = addDays(range.start, d).split("-").map(Number);
    out.push({ x: d * pxPerDay, label: `${MONTHS[m - 1]} ${day}` });
  }
  return out;
}

/** Orders by start date, then by label, so the chart reads from the top as time moves on. */
export function sortItems(items: GanttItem[]): GanttItem[] {
  return [...items].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.label.localeCompare(b.label)));
}

export const GANTT_COLOR = { order: "#2F6BFF", planned: "#F2B13C", late: "#FF6B7A" } as const;
