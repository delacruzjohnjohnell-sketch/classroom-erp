// Gathers the class's scores for the teacher: runs the practice-set checks over every Standard and Manufacturing company, and reads the AIS scores from the database.
// The arranging and the Excel file are in classScores.ts; this file only talks to the database.
import { supabase } from "@/lib/supabase";
import { loadPracticeData } from "@/lib/practiceData";
import { runPracticeChecks, summarize, PRACTICE_SETS, type CheckResult, type PracticeSet } from "@/lib/practiceCheck";
import { runMfgPracticeChecks, summarizeMfg, type MfgPracticeSet, type MfgSnapshot } from "@/lib/mfgPracticeCheck";
import type { DetailRow, Edition, ScoreRow } from "@/lib/classScores";

export type ClassCompany = { id: string; name: string; edition: "Standard" | "Manufacturing"; students: string[] };

/** The Standard and Manufacturing companies that have at least one student in them. (AIS companies come from the gradebook.) */
export async function loadClassCompanies(): Promise<ClassCompany[]> {
  const [tn, ed, mb] = await Promise.all([
    supabase.from("tenants").select("id, name"),
    supabase.from("tenant_editions").select("tenant_id, edition"),
    supabase.from("memberships").select("tenant_id, user_id"),
  ]);
  if (tn.error) throw new Error(tn.error.message);
  const edition = new Map(((ed.data as { tenant_id: string; edition: string }[]) ?? []).map((r) => [r.tenant_id, r.edition]));
  const members = (mb.data as { tenant_id: string; user_id: string }[]) ?? [];
  const ids = [...new Set(members.map((m) => m.user_id))];
  const pr = ids.length ? await supabase.from("profiles").select("id, full_name, role").in("id", ids) : { data: [] as { id: string; full_name: string | null; role: string }[] };
  const students = new Map(((pr.data as { id: string; full_name: string | null; role: string }[]) ?? []).filter((p) => p.role === "student").map((p) => [p.id, p.full_name ?? "Student"]));
  const out: ClassCompany[] = [];
  for (const t of (tn.data as { id: string; name: string }[]) ?? []) {
    const e = edition.get(t.id) ?? "STANDARD";
    if (e !== "STANDARD" && e !== "MANUFACTURING") continue;
    const names = members.filter((m) => m.tenant_id === t.id && students.has(m.user_id)).map((m) => students.get(m.user_id)!);
    if (names.length === 0) continue;
    out.push({ id: t.id, name: t.name, edition: e === "MANUFACTURING" ? "Manufacturing" : "Standard", students: names.sort() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const detailFrom = (edition: Edition, activity: string, c: { name: string; students: string[] }, r: CheckResult): DetailRow => ({
  edition, activity, company: c.name, students: c.students.join(", "), group: r.group, item: r.label, points: r.pass ? 1 : 0, max: 1,
  note: r.pass ? "" : `Expected ${r.expected}; found ${r.actual}${r.hint ? `. ${r.hint}` : ""}`,
});

/** One Standard company checked against every Standard practice set (the data is read once). One row per set. */
export async function scoreStandardAll(c: ClassCompany, sets: PracticeSet[]): Promise<ScoreRow[]> {
  const data = await loadPracticeData(c.id);
  return sets.map((set) => {
    const results = runPracticeChecks(data, set);
    const s = summarize(results);
    return { edition: "Standard" as const, activity: set.name, company: c.name, students: c.students, points: s.passed, max: s.total, status: "Checked now", detail: results.map((r) => detailFrom("Standard", set.name, c, r)) };
  });
}

/** One Manufacturing company checked against every Manufacturing practice set. */
export async function scoreMfgAll(c: ClassCompany, sets: MfgPracticeSet[]): Promise<ScoreRow[]> {
  let r = await supabase.rpc("mfg_practice_snapshot_a2", { p_tenant: c.id });
  if (r.error) r = await supabase.rpc("mfg_practice_snapshot", { p_tenant: c.id });
  if (r.error) throw new Error(r.error.message);
  const snap = r.data as MfgSnapshot;
  return sets.map((set) => {
    const results = runMfgPracticeChecks(snap, set);
    const s = summarizeMfg(results);
    return { edition: "Manufacturing" as const, activity: set.name, company: c.name, students: c.students, points: s.passed, max: s.total, status: "Checked now", detail: results.map((x) => detailFrom("Manufacturing", set.name, c, x)) };
  });
}

export async function loadMfgSets(): Promise<{ id: string; name: string; summary: string }[]> {
  const r = await supabase.rpc("mfg_practice_set_list");
  if (r.error) throw new Error(r.error.message);
  return (r.data as { id: string; name: string; summary: string }[]) ?? [];
}
export async function loadMfgSet(id: string): Promise<MfgPracticeSet> {
  const r = await supabase.rpc("mfg_practice_set_get", { p_id: id });
  if (r.error) throw new Error(r.error.message);
  return r.data as MfgPracticeSet;
}

const AIS_AREA: Record<string, string> = { INBOX: "AIS: Document inbox", SALES: "AIS: Sales desk", PURCHASES: "AIS: Purchases desk", PAYROLL: "AIS: Payroll desk", ASSETS: "AIS: Fixed assets desk", CLOSE: "AIS: Close and statements", AUDIT: "AIS: Audit room" };
const AIS_ORDER = ["INBOX", "SALES", "PURCHASES", "PAYROLL", "ASSETS", "CLOSE", "AUDIT"];
const PHASE: Record<string, string> = { ACCOUNTING: "Accounting phase", AUDIT: "Audit phase", CLOSED: "Finished" };

/** Every AIS company: one row per company and area (the inbox, each desk, the audit), with the items behind it. */
export async function loadAisRows(): Promise<ScoreRow[]> {
  const [g, it] = await Promise.all([supabase.rpc("ais_class_gradebook"), supabase.rpc("ais_class_score_items")]);
  if (g.error) throw new Error(g.error.message);
  if (it.error) throw new Error(it.error.message);
  const companies = new Map<string, { company: string; phase: string; students: string[] }>();
  for (const x of (g.data as { tenant_id: string; company: string; phase: string; members: { name: string; seats: string[] }[] }[]) ?? [])
    companies.set(x.tenant_id, { company: x.company, phase: x.phase, students: x.members.map((m) => m.name) });
  const items = (it.data as { tenant_id: string; company: string; area: string; seq: number; label: string; points: number | string; max: number | string; message: string }[]) ?? [];
  const out: ScoreRow[] = [];
  for (const [tid, c] of companies) {
    for (const area of AIS_ORDER) {
      const rows = items.filter((r) => r.tenant_id === tid && r.area === area).sort((a, b) => a.seq - b.seq);
      if (rows.length === 0) continue;
      const activity = AIS_AREA[area];
      const students = c.students.join(", ");
      out.push({
        edition: "AIS", activity, company: c.company, students: c.students,
        points: rows.reduce((s, r) => s + Number(r.points), 0), max: rows.reduce((s, r) => s + Number(r.max), 0), status: PHASE[c.phase] ?? c.phase,
        detail: rows.map((r) => ({ edition: "AIS" as const, activity, company: c.company, students, group: AIS_AREA[area].replace("AIS: ", ""), item: `${r.seq}. ${r.label}`, points: Number(r.points), max: Number(r.max), note: r.message })),
      });
    }
  }
  return out;
}

/** Runs fn over the items, a few at a time, reporting how many are done. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>, onProgress?: (done: number, total: number) => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0, done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      done += 1; onProgress?.(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export { PRACTICE_SETS };
