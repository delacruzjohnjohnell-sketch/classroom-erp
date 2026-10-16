// Small pure helpers for the capacity view: how busy a work centre is, and how to group the rows the database returns.
// No database, no React.

export type LoadRow = {
  work_center_id: string; bucket_no: number; bucket_start: string;
  available_h: number; open_h: number; planned_h: number; required_h: number; load_pct: number | null;
};

export type LoadTone = "idle" | "ok" | "busy" | "over";

/** Nothing to do, comfortable, nearly full (85 % and up), or more work than hours (also: work but no working hours at all). */
export function loadTone(requiredH: number, availableH: number): LoadTone {
  if (!(requiredH > 0.000001)) return "idle";
  if (!(availableH > 0.000001)) return "over";
  const pct = (requiredH / availableH) * 100;
  return pct > 100 + 1e-9 ? "over" : pct >= 85 ? "busy" : "ok";
}

export const LOAD_TONE_COLOR: Record<LoadTone, string> = { idle: "#C5D0E2", ok: "#22D3C5", busy: "#F2B13C", over: "#FF6B7A" };
export const LOAD_TONE_LABEL: Record<LoadTone, string> = { idle: "Nothing planned", ok: "Within capacity", busy: "Nearly full", over: "Overloaded" };

/** "46 %", or "No hours" when there is work but the work centre has no working hours in that column. */
export function loadText(r: Pick<LoadRow, "required_h" | "available_h" | "load_pct">): string {
  if (!(Number(r.required_h) > 0.000001)) return "—";
  if (!(Number(r.available_h) > 0.000001)) return "No hours";
  return `${Math.round(Number(r.load_pct ?? 0))} %`;
}

/** Rows grouped by work centre, columns in date order. */
export function groupByWorkCenter(rows: LoadRow[]): Map<string, LoadRow[]> {
  const m = new Map<string, LoadRow[]>();
  for (const r of rows) {
    const list = m.get(r.work_center_id);
    if (list) list.push(r); else m.set(r.work_center_id, [r]);
  }
  for (const list of m.values()) list.sort((a, b) => a.bucket_no - b.bucket_no);
  return m;
}

export type LoadSummary = { required: number; available: number; peakPct: number; overColumns: number; busyColumns: number; firstOver: string | null };

/** One work centre across all its columns. peakPct is the highest load; a column with work but no hours counts as overloaded. */
export function summarise(rows: LoadRow[]): LoadSummary {
  let required = 0, available = 0, peakPct = 0, overColumns = 0, busyColumns = 0, firstOver: string | null = null;
  for (const r of [...rows].sort((a, b) => a.bucket_no - b.bucket_no)) {
    required += Number(r.required_h);
    available += Number(r.available_h);
    const tone = loadTone(Number(r.required_h), Number(r.available_h));
    if (r.load_pct != null) peakPct = Math.max(peakPct, Number(r.load_pct));
    if (tone === "over") { overColumns++; if (!firstOver) firstOver = r.bucket_start; }
    if (tone === "busy") busyColumns++;
  }
  return { required: Math.round(required * 100) / 100, available: Math.round(available * 100) / 100, peakPct, overColumns, busyColumns, firstOver };
}
