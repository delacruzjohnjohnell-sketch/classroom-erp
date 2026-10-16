// Small pure helpers for the Manufacturing dashboard: dates, shares, stock status. No database, no React.

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const greeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

export const firstName = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] || "there";

/** Local calendar day as YYYY-MM-DD. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The `n` days ending on `endIso`, oldest first. */
export function lastDays(n: number, endIso: string): string[] {
  const [y, m, d] = endIso.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => isoDay(new Date(y, m - 1, d - (n - 1 - i))));
}

/** "Jul 7" for 2026-07-07. */
export function shortDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Percent change from `before` to `now`, or null when there was nothing before to compare with. */
export function pctChange(now: number, before: number): number | null {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Units made per day: reversals (negative rows) subtract, and a day never shows below zero. */
export function outputByDay(rows: { posting_date: string; yield_qty: number; scrap_qty: number }[], days: string[]) {
  return days.map((day) => {
    let good = 0, scrap = 0;
    for (const r of rows) if (r.posting_date === day) { good += Number(r.yield_qty); scrap += Number(r.scrap_qty); }
    return { day, label: shortDay(day), good: Math.max(good, 0), scrap: Math.max(scrap, 0) };
  });
}

/** The biggest `keep` entries with their share of the total, the rest lumped into "Others". Zero and negative quantities are ignored. */
export function shareOf(rows: { name: string; qty: number }[], keep = 4): { name: string; qty: number; pct: number }[] {
  const pos = rows.filter((r) => r.qty > 0).sort((a, b) => b.qty - a.qty);
  const total = pos.reduce((s, r) => s + r.qty, 0);
  if (total <= 0) return [];
  const top = pos.slice(0, keep);
  const rest = pos.slice(keep).reduce((s, r) => s + r.qty, 0);
  const all = rest > 0 ? [...top, { name: "Others", qty: rest }] : top;
  return all.map((r) => ({ ...r, pct: Math.round((r.qty / total) * 100) }));
}

export type StockState = "OUT" | "LOW" | "OK";
export function stockState(onHand: number, reorder: number): StockState {
  if (onHand <= 0) return "OUT";
  return reorder > 0 && onHand <= reorder ? "LOW" : "OK";
}
export const STOCK_STATE_LABEL: Record<StockState, string> = { OUT: "Out of stock", LOW: "Low stock", OK: "Healthy" };

/** "10:12 AM" for today, "Yesterday", otherwise "Oct 12". */
export function whenLabel(iso: string, now: Date): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const day = isoDay(t), today = isoDay(now);
  if (day === today) {
    const h = t.getHours();
    return `${h % 12 === 0 ? 12 : h % 12}:${pad(t.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
  }
  if (day === lastDays(2, today)[0]) return "Yesterday";
  return shortDay(day);
}
