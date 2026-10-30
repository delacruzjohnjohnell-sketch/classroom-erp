// Pure helpers for the AIS class gradebook: percentages, the heat colours, the CSV the teacher downloads, and a plain-words reading of which traps fooled the class.
// No imports, so the unit tests can load this file directly. The numbers themselves come from the database (ais_class_gradebook, ais_detection_matrix, ais_desk_matrix).

export type GradeRow = {
  tenant_id: string; company: string; set_id: string; set_title: string; mode: "IMMEDIATE" | "AFTER_CLOSE"; phase: "ACCOUNTING" | "AUDIT" | "CLOSED";
  members: { name: string; seats: string[] }[]; created_at: string;
  desk_points: number; desk_max: number; desk_decided: number; desk_total: number;
  audit_points: number | null; audit_max: number | null; audit_planted: number | null; audit_found: number | null; audit_wrong_type: number | null; audit_missed: number | null;
  audit_false_positives: number | null; findings: number;
};
export type DetectionRow = { exception_type: string; label: string; planted_n: number; found_n: number; wrong_type_n: number; missed_n: number; companies_n: number };
export type DeskRow = { seq: number; key_decision: "POST" | "HOLD"; failed_control: string | null; docs: number; posted: number; held_right: number; held_other: number; avg_points: number | null };

/** A whole-number percentage, or null when there is nothing to divide by (or no score yet). */
export function pct(points: number | null | undefined, max: number | null | undefined): number | null {
  if (points === null || points === undefined || !max) return null;
  return Math.round((points / max) * 100);
}

export const PHASE_LABEL: Record<GradeRow["phase"], string> = { ACCOUNTING: "Accounting", AUDIT: "Audit", CLOSED: "Finished" };

/** A cell colour for a detection or accuracy rate between 0 and 1: red when hardly anyone got it, green when almost everyone did. Null for no data. */
export function heatColor(rate: number | null): string | null {
  if (rate === null || Number.isNaN(rate)) return null;
  const r = Math.max(0, Math.min(1, rate));
  const hue = Math.round(r * 130);                     // 0 = red, 130 = green
  return `hsla(${hue}, 70%, 45%, 0.28)`;
}

export const rate = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

/** The detection rate of one exception type: found with the right type, out of everything planted. */
export const detectionRate = (r: DetectionRow): number | null => rate(r.found_n, r.planted_n);

/** How a document did at the desk: the share of students who made the right call on it. */
export function deskAccuracy(r: DeskRow): number | null {
  if (r.docs <= 0) return null;
  // a valid document is right when posted; an exception is right when held for the right control
  return r.key_decision === "POST" ? r.posted / r.docs : r.held_right / r.docs;
}

/** One line on what fooled the class about a document. */
export function deskReading(r: DeskRow): string {
  if (r.docs === 0) return "Nobody has decided this one yet.";
  if (r.key_decision === "HOLD") {
    const wrongPost = Math.round((r.posted / r.docs) * 100);
    if (r.posted === 0 && r.held_other === 0) return "Everyone held it for the right reason.";
    const parts: string[] = [];
    if (r.posted) parts.push(`${wrongPost}% posted it although a control had failed`);
    if (r.held_other) parts.push(`${Math.round((r.held_other / r.docs) * 100)}% held it but named a different control`);
    return parts.join("; ") + ".";
  }
  const held = r.held_right + r.held_other;
  if (held === 0) return "Everyone posted it, as they should.";
  return `${Math.round((held / r.docs) * 100)}% held a valid document.`;
}

export type ClassSummary = { companies: number; started: number; finished: number; avgDeskPct: number | null; avgAuditPct: number | null };
/** Class-level figures: how many companies, how many have started and finished, and the average Accounting and Audit percentages (finished audits only for Audit). */
export function classSummary(rows: GradeRow[]): ClassSummary {
  const deskPcts = rows.filter((r) => r.desk_decided > 0).map((r) => pct(r.desk_points, r.desk_max)).filter((x): x is number => x !== null);
  const auditPcts = rows.filter((r) => r.phase === "CLOSED").map((r) => pct(r.audit_points, r.audit_max)).filter((x): x is number => x !== null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return { companies: rows.length, started: rows.filter((r) => r.desk_decided > 0).length, finished: rows.filter((r) => r.phase === "CLOSED").length, avgDeskPct: avg(deskPcts), avgAuditPct: avg(auditPcts) };
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The gradebook as a CSV file's text: one row per company, with the members listed in one cell. */
export function gradebookCsv(rows: GradeRow[]): string {
  const head = ["Company", "Members", "Practice set", "Mode", "Phase", "Documents decided", "Documents", "Accounting points", "Accounting max", "Accounting %",
    "Audit points", "Audit max", "Audit %", "Planted exceptions", "Found", "Wrong type", "Missed", "False reports", "Findings"];
  const lines = [head.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push([
      r.company, r.members.map((m) => `${m.name} (${m.seats.length ? m.seats.map((s) => s.toLowerCase()).join("+") : "no seat"})`).join("; "), r.set_title,
      r.mode === "IMMEDIATE" ? "Practice" : "Graded", PHASE_LABEL[r.phase], r.desk_decided, r.desk_total, r.desk_points, r.desk_max, pct(r.desk_points, r.desk_max),
      r.audit_points, r.audit_max, pct(r.audit_points, r.audit_max), r.audit_planted, r.audit_found, r.audit_wrong_type, r.audit_missed, r.audit_false_positives, r.findings,
    ].map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
