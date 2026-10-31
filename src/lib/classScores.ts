// The teacher's class-wide scores: one shape for every edition, the maths over it (student matrix, most-missed items), and the Excel workbook.
// The numbers come from the database (AIS) or from the practice-set checks run over each company (Standard, Manufacturing); this file only arranges them.
// exceljs is loaded on demand so it is not in the page's first download.

export type Edition = "Standard" | "Manufacturing" | "AIS";
export type DetailRow = {
  edition: Edition; activity: string; company: string; students: string; group: string; item: string; points: number; max: number; note: string;
};
export type ScoreRow = {
  edition: Edition; activity: string; company: string; students: string[]; points: number | null; max: number | null; status: string; detail: DetailRow[];
};

/** A whole-number percentage, or null when there is nothing to divide by. */
export function pctOf(points: number | null | undefined, max: number | null | undefined): number | null {
  if (points === null || points === undefined || !max) return null;
  return Math.round((points / max) * 100);
}

export function resultOf(points: number, max: number): "Correct" | "Partly" | "Missed" {
  if (points >= max) return "Correct";
  return points > 0 ? "Partly" : "Missed";
}

const EDITION_ORDER: Record<Edition, number> = { Standard: 0, Manufacturing: 1, AIS: 2 };

/** One row per student, one column per activity. A student with several companies in the same activity keeps the best percentage. */
export function studentMatrix(rows: ScoreRow[]): { activities: string[]; students: { name: string; cells: Record<string, number | null>; average: number | null }[] } {
  const acts = new Map<string, Edition>();
  for (const r of rows) acts.set(r.activity, r.edition);
  const activities = [...acts.entries()].sort((a, b) => EDITION_ORDER[a[1]] - EDITION_ORDER[b[1]] || a[0].localeCompare(b[0])).map((e) => e[0]);
  const byStudent = new Map<string, Record<string, number | null>>();
  for (const r of rows) {
    const p = pctOf(r.points, r.max);
    for (const name of r.students) {
      const cells = byStudent.get(name) ?? {};
      const cur = cells[r.activity];
      cells[r.activity] = p === null ? (cur ?? null) : cur === null || cur === undefined ? p : Math.max(cur, p);
      byStudent.set(name, cells);
    }
  }
  const students = [...byStudent.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, cells]) => {
    const vals = Object.values(cells).filter((v): v is number => v !== null);
    return { name, cells, average: vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null };
  });
  return { activities, students };
}

/** The items most students got wrong, so the teacher knows what to reteach. */
export function mostMissed(detail: DetailRow[], limit = 30) {
  const map = new Map<string, { edition: Edition; activity: string; item: string; attempts: number; missed: number; points: number; max: number }>();
  for (const d of detail) {
    const key = `${d.edition}\u0000${d.activity}\u0000${d.item}`;
    const cur = map.get(key) ?? { edition: d.edition, activity: d.activity, item: d.item, attempts: 0, missed: 0, points: 0, max: d.max };
    cur.attempts += 1; cur.points += d.points; if (d.points < d.max) cur.missed += 1;
    map.set(key, cur);
  }
  return [...map.values()].filter((x) => x.missed > 0)
    .map((x) => ({ ...x, missRate: x.missed / x.attempts, averagePoints: x.points / x.attempts }))
    .sort((a, b) => b.missRate - a.missRate || b.attempts - a.attempts || a.item.localeCompare(b.item)).slice(0, limit);
}

/** The text of a result for the Detail sheet. */
export const detailResult = (d: Pick<DetailRow, "points" | "max">) => resultOf(d.points, d.max);

const PURPLE = "FF6A45D6";

/** Builds the workbook: Summary, Standard, Manufacturing, AIS, Detail and Class insights. */
export async function buildClassWorkbook(rows: ScoreRow[], opts: { includeAnswers: boolean; generated?: string } = { includeAnswers: true }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Classroom ERP";
  wb.created = new Date();
  const mk = (name: string, widths: number[]) => {
    const ws = wb.addWorksheet(name);
    ws.columns = widths.map((w) => ({ width: w }));
    return ws;
  };
  const header = (ws: ReturnType<typeof mk>, labels: string[]) => {
    const h = ws.addRow(labels);
    h.font = { bold: true, color: { argb: "FFFFFFFF" } };
    h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: PURPLE } };
    h.height = 22;
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Summary
  const m = studentMatrix(rows);
  const sum = mk("Summary", [26, ...m.activities.map(() => 22), 12]);
  header(sum, ["Student", ...m.activities, "Average"]);
  for (const s of m.students) {
    const r = sum.addRow([s.name, ...m.activities.map((a) => (s.cells[a] === null || s.cells[a] === undefined ? "" : s.cells[a]! / 100)), s.average === null ? "" : s.average / 100]);
    for (let c = 2; c <= m.activities.length + 2; c++) r.getCell(c).numFmt = "0%";
  }
  sum.addRow([]);
  sum.addRow([`Percent of the maximum score, best attempt per activity. Generated ${opts.generated ?? new Date().toLocaleString("en-PH")}.`]);

  // One sheet per edition
  for (const ed of ["Standard", "Manufacturing", "AIS"] as Edition[]) {
    const ws = mk(ed, [28, 30, 38, 10, 10, 10, 16]);
    header(ws, ["Company", "Students", "Activity", "Score", "Maximum", "Percent", "Status"]);
    for (const r of rows.filter((x) => x.edition === ed)) {
      const p = pctOf(r.points, r.max);
      const row = ws.addRow([r.company, r.students.join(", "), r.activity, r.points ?? "", r.max ?? "", p === null ? "" : p / 100, r.status]);
      row.getCell(6).numFmt = "0%";
    }
  }

  // Detail
  const det = mk("Detail", [12, 34, 26, 28, 24, 44, 8, 8, 10, 60]);
  header(det, ["Edition", "Activity", "Company", "Students", "Group", "Item", "Points", "Maximum", "Result", "Note"]);
  for (const r of rows) for (const d of r.detail) det.addRow([d.edition, d.activity, d.company, d.students, d.group, d.item, d.points, d.max, detailResult(d), opts.includeAnswers ? d.note : ""]);
  det.autoFilter = { from: "A1", to: "J1" };

  // Class insights
  const ins = mk("Class insights", [12, 34, 54, 10, 10, 10, 14, 10]);
  header(ins, ["Edition", "Activity", "Item", "Attempts", "Missed", "Miss rate", "Average points", "Maximum"]);
  for (const x of mostMissed(rows.flatMap((r) => r.detail))) {
    const row = ins.addRow([x.edition, x.activity, x.item, x.attempts, x.missed, x.missRate, Math.round(x.averagePoints * 100) / 100, x.max]);
    row.getCell(6).numFmt = "0%";
  }
  return wb;
}

/** The workbook as bytes, ready to save. */
export async function classWorkbookBytes(rows: ScoreRow[], opts?: { includeAnswers: boolean; generated?: string }): Promise<ArrayBuffer> {
  const wb = await buildClassWorkbook(rows, opts);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
