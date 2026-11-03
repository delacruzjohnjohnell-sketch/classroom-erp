// Compact builders for a form's lesson and cases, so each form's pack is mostly its content.
import type { CaseDef, Level } from "../cases/types";
import type { Lesson } from "../components/LearnPage";
import type { Classification } from "../engine/tax";
import type { Values } from "../forms/types";
import { AS_OF } from "../content/f1701a";

export type G = [item: string, field: string, enter: string, source: string, mistake: string];
export type Q = [q: string, choices: string[], answer: number, explain: string];
export type LessonBody = Omit<Lesson, "cases">;

export interface LessonSpec {
  title: string; minutes?: string;
  sections: [heading: string, ...paragraphs: string[]][];
  worked: { intro: string; steps: string[]; title: string; table: Record<string, string> };
  legal: string[]; guide: G[]; checklist: string[]; pitfalls: string[]; amended: string; noPayment: string; quiz: Q[];
}

export function lessonOf(s: LessonSpec): LessonBody {
  return {
    asOf: AS_OF,
    lecture: {
      title: s.title, minutes: s.minutes ?? "About 8 minutes",
      sections: s.sections.map(([heading, ...body]) => ({ heading, body })),
      worked: { intro: s.worked.intro, steps: s.worked.steps, tables: [{ title: s.worked.title, data: s.worked.table }] },
      legal: [...s.legal, `Rules in this lab are as of ${AS_OF}.`],
    },
    guide: s.guide.map(([item, field, enter, source, mistake]) => ({ item, field, enter, source, mistake })),
    tips: { checklist: s.checklist, pitfalls: s.pitfalls, amended: s.amended, noPayment: s.noPayment },
    quiz: s.quiz.map(([q, choices, answer, explain]) => ({ q, choices, answer, explain })),
  };
}

export interface CaseSpec {
  form: string; level: Level; year: number; title: string; story: string[];
  profile: Values; facts: Values; filing: string; klass?: Classification;
  why: string; hints: string[]; solution: string[];
}

export const caseOf = (c: CaseSpec): CaseDef => ({
  id: `${c.form}-${c.level}`, form: c.form, level: c.level, year: c.year, title: c.title, story: c.story,
  profile: c.profile, facts: c.facts, filingDate: c.filing, classification: c.klass,
  correctForm: c.form, whyForm: c.why, hints: c.hints, solution: c.solution,
});

/** Standard fictional taxpayer identity for a form: the caller supplies the form's own item ids. */
export const person = (ids: { tin: string; rdo: string; name: string; addr: string; zip: string }, p: { n: number; rdo: string; name: string; addr: string; zip: string }, extra: Values = {}): Values => ({
  [ids.tin]: `000-000-${String(p.n).padStart(3, "0")}-00000`, [ids.rdo]: p.rdo, [ids.name]: p.name, [ids.addr]: p.addr, [ids.zip]: p.zip, ...extra,
});

// Date helpers live in engine/dates.ts; re-exported so the packs keep one import.
export { addDays, dayOfNextMonth, lastDay, parseMonth, quarterEnd, ymd } from "../engine/dates";
