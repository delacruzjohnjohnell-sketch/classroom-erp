// Announcements per system (migration 0092): who is named, who ranks first, and the wording of the congratulation the teacher approves.
// Pure functions, no database and no imports, so the rules are tested in tests/announce.test.ts. The page that gathers the scores is src/lib/announceLoad.ts.

export type SystemId = "STANDARD" | "MANUFACTURING" | "AIS" | "BFAR" | "BIR";
export const SYSTEMS: { id: SystemId; label: string }[] = [
  { id: "STANDARD", label: "Standard ERP" },
  { id: "MANUFACTURING", label: "Manufacturing ERP" },
  { id: "AIS", label: "Accounting Information Systems" },
  { id: "BFAR", label: "Basic Financial Accounting (BFAR)" },
  { id: "BIR", label: "BIR eForms Lab" },
];
export const systemLabel = (id: string) => SYSTEMS.find((s) => s.id === id)?.label ?? id;

/** One company, team or student's score in one practice set. */
export type ScoreLine = { system: SystemId; activity: string; label: string; who: string[]; points: number; max: number };
export type Draft = { system: SystemId; activity: string; title: string; body: string; board: string; top: ScoreLine[] };

const SUFFIX = /^(jr|sr|ii|iii|iv)\.?$/i;
const cap = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "");

/** "Honey Angela Cruz" -> "Honey C."; "Salvador, Angeline Fay" -> "Angeline S."; a single name stays as it is. */
export function shortName(full: string | null | undefined): string {
  const s = (full ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "A student";
  let first: string, last = "";
  if (s.includes(",")) {
    const [l, f] = s.split(",", 2);
    last = l.trim().split(" ")[0] ?? "";
    first = (f ?? "").trim().split(" ")[0] ?? "";
    if (!first) { first = last; last = ""; }
  } else {
    const parts = s.split(" ");
    first = parts[0];
    const rest = parts.slice(1).filter((p) => !SUFFIX.test(p));
    last = rest.length ? rest[rest.length - 1] : "";
  }
  const initial = last ? `${last.charAt(0).toUpperCase()}.` : "";
  return initial ? `${cap(first)} ${initial}` : cap(first);
}

const joinAnd = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);
const pct = (l: ScoreLine) => (l.max > 0 ? l.points / l.max : 0);
export const pctText = (l: ScoreLine) => `${Math.round(pct(l) * 1000) / 10}%`;
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** Who a line is: the student, or the team or company with its members in brackets. */
export function namesOf(l: ScoreLine): string {
  const n = l.who.map(shortName);
  if (n.length === 0) return l.label;
  if (n.length === 1) return n[0];
  return `${l.label} (${joinAnd(n)})`;
}

/** Best first (percentage, then points). Lines with nothing scored are left out: nobody is congratulated for zero. */
export function rankLines(lines: ScoreLine[]): ScoreLine[] {
  return lines.filter((l) => l.max > 0 && l.points > 0).sort((a, b) => pct(b) - pct(a) || b.points - a.points || a.label.localeCompare(b.label));
}

const board = (ranked: ScoreLine[]) => (ranked.length < 2 ? "" : `Top ${Math.min(5, ranked.length)}: ${ranked.slice(0, 5).map((l, i) => `${i + 1}. ${namesOf(l)} ${num(l.points)}/${num(l.max)}`).join("; ")}.`);

/** One draft per practice set that has a score: the congratulation for whoever is first (all of them when tied), and the top-5 line the teacher can add. */
export function makeDrafts(lines: ScoreLine[]): Draft[] {
  const groups = new Map<string, ScoreLine[]>();
  for (const l of lines) groups.set(`${l.system}\u0000${l.activity}`, [...(groups.get(`${l.system}\u0000${l.activity}`) ?? []), l]);
  const order = SYSTEMS.map((s) => s.id as string);
  const out: Draft[] = [];
  for (const [key, group] of groups) {
    const [system, activity] = key.split("\u0000") as [SystemId, string];
    const ranked = rankLines(group);
    if (ranked.length === 0) continue;
    const first = ranked[0];
    const top = ranked.filter((l) => pct(l) === pct(first) && l.points === first.points);
    const score = `${num(first.points)}/${num(first.max)} (${pctText(first)})`;
    const body = top.length === 1
      ? `Congratulations to ${namesOf(first)} for the highest score in ${activity}: ${score}. Well done, and keep it up!`
      : `Congratulations to ${joinAnd(top.map(namesOf))}, who share the highest score in ${activity}: ${score}. Well done, and keep it up!`;
    out.push({ system, activity, title: `Congratulations: top score in ${activity}`, body, board: board(ranked), top });
  }
  return out.sort((a, b) => order.indexOf(a.system) - order.indexOf(b.system) || a.activity.localeCompare(b.activity));
}

type RowIn = { edition: string; activity: string; company: string; students: string[]; points: number | null; max: number | null };
/** Standard, Manufacturing and AIS rows from the class scores. */
export function fromScoreRows(rows: RowIn[]): ScoreLine[] {
  const sys: Record<string, SystemId> = { Standard: "STANDARD", Manufacturing: "MANUFACTURING", AIS: "AIS" };
  return rows.filter((r) => sys[r.edition] && r.points !== null && r.max !== null)
    .map((r) => ({ system: sys[r.edition], activity: r.activity, label: r.company, who: r.students, points: Number(r.points), max: Number(r.max) }));
}

type BirIn = { student: string; form_id: string; case_id: string; score: number; max_score: number; wrong_form: boolean };
/** BIR Lab: each student's best attempt on every case, added up. Free-fill attempts and attempts on the wrong form do not count. */
export function fromBir(rows: BirIn[], activity = "BIR eForms Lab: practice cases"): ScoreLine[] {
  const best = new Map<string, Map<string, BirIn>>();
  for (const r of rows) {
    if (r.wrong_form || !r.case_id || r.max_score <= 0) continue;
    const mine = best.get(r.student) ?? new Map<string, BirIn>();
    const key = `${r.form_id}|${r.case_id}`;
    const cur = mine.get(key);
    if (!cur || r.score / r.max_score > cur.score / cur.max_score) mine.set(key, r);
    best.set(r.student, mine);
  }
  return [...best].map(([student, cases]) => {
    const list = [...cases.values()];
    return { system: "BIR" as const, activity, label: student, who: [student], points: list.reduce((s, r) => s + r.score, 0), max: list.reduce((s, r) => s + r.max_score, 0) };
  });
}

type BfarIn = { student: string; setId: string; score: number | null; max: number | null };
/** BFAR: only work the teacher has marked counts; a student's best marked score in each set. */
export function fromBfar(rows: BfarIn[], setNames: Record<string, string> = {}): ScoreLine[] {
  const best = new Map<string, BfarIn>();
  for (const r of rows) {
    if (r.score === null || r.max === null || r.max <= 0) continue;
    const key = `${r.student}|${r.setId}`;
    const cur = best.get(key);
    if (!cur || r.score / r.max > (cur.score as number) / (cur.max as number)) best.set(key, r);
  }
  return [...best.values()].map((r) => ({ system: "BFAR" as const, activity: setNames[r.setId] ?? r.setId, label: r.student, who: [r.student], points: r.score as number, max: r.max as number }));
}
