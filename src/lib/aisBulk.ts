// Turns a pasted class list into the companies the teacher wants created. Pure, so the unit tests can load it directly; the component does the creating.
//
// One company per line:   Company name, Accounting student, Audit student
// The comma may be a tab (copied from a spreadsheet). The audit student is optional: leave it out, or repeat the same name, and the company is a solo company.

export type Student = { id: string; full_name: string };
export type BulkPlan = { line: number; company: string; accounting: Student | null; audit: Student | null; solo: boolean; errors: string[] };

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

function findStudent(name: string, students: Student[]): { student: Student | null; error: string | null } {
  if (!name.trim()) return { student: null, error: null };
  const hits = students.filter((s) => norm(s.full_name) === norm(name));
  if (hits.length === 1) return { student: hits[0], error: null };
  if (hits.length > 1) return { student: null, error: `More than one student is called "${name.trim()}".` };
  return { student: null, error: `No student is called "${name.trim()}".` };
}

export function parseCompanyList(text: string, students: Student[]): BulkPlan[] {
  const plans: BulkPlan[] = [];
  const seenCompanies = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const row = raw.trim();
    if (!row) return;
    const cells = row.split(/\t|,/).map((c) => c.trim());
    if (i === 0 && /^company( name)?$/i.test(cells[0])) return;     // a header row copied from a spreadsheet
    const [company = "", acc = "", aud = ""] = cells;
    const errors: string[] = [];
    if (!company) errors.push("Write the company name.");
    else if (seenCompanies.has(norm(company))) errors.push(`The company "${company}" is in the list twice.`);
    seenCompanies.add(norm(company));
    const a = findStudent(acc, students); const b = findStudent(aud, students);
    if (!acc.trim()) errors.push("Name the Accounting student.");
    if (a.error) errors.push(a.error);
    if (b.error) errors.push(b.error);
    const solo = !!a.student && (!b.student || b.student.id === a.student.id) && !b.error;
    plans.push({ line: i + 1, company, accounting: a.student, audit: solo ? a.student : b.student, solo, errors });
  });
  // a student may be in only one of the new companies
  const used = new Map<string, number>();
  for (const p of plans) for (const s of new Set([p.accounting, p.audit])) if (s) {
    const first = used.get(s.id);
    if (first !== undefined && first !== p.line) p.errors.push(`${s.full_name} is already in line ${first}.`);
    else used.set(s.id, p.line);
  }
  return plans;
}

export const planOk = (p: BulkPlan) => p.errors.length === 0 && !!p.accounting && !!p.audit && p.company.trim().length > 0;
