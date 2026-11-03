// A compact way to declare a BIR form: header fields, then rows with a formula each. `makeForm` turns the spec into a FormDef
// (compute, validate, dueDate, scoring), so a form is mostly a transcription of the official item numbers and labels.
import { amt, classify, hasCentavos, isEmail, isRdo, isTin, penaltiesFor, type Classification } from "../engine/tax";
import type { ComputeContext, FieldDef, FormDef, Issue, Option, Page, Row, Section, Values } from "./types";

export const f = (id: string, item: string, label: string, kind: FieldDef["kind"], extra: Partial<FieldDef> = {}): FieldDef => ({ id, item, label, kind, ...extra });
export const yes = (id: string, item: string, label: string, span = 4): FieldDef => f(id, item, label, "yesno", { span, required: true });
export const opts = (...pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));
export const radio = (id: string, item: string, label: string, options: Option[], extra: Partial<FieldDef> = {}): Row => ({ type: "fields", fields: [f(id, item, label, "radio", { span: 12, options, required: true, ...extra })] });
export const fields = (...fs: FieldDef[]): Row => ({ type: "fields", fields: fs });

/** What a formula sees: `n(id)` is the typed or already-computed amount (centavos) of this row id in the current column. */
export interface Calc { n: (id: string) => number; /** The value of a row in a given column, typed or already computed. */ at: (id: string, col: "A" | "B") => number; /** The sum of the A and B columns of a row. */ both: (id: string) => number; v: Values; col: "A" | "B"; year: number; ctx: ComputeContext; text: (id: string) => string }

export interface RowSpec {
  id: string; item: string; label: string;
  /** Present for a computed row. Omit for a typed row. */
  f?: (c: Calc) => number;
  indent?: 0 | 1 | 2; bold?: boolean; specify?: boolean; key?: boolean;
  /** A typed row that may legitimately be negative (for example an adjustment). */
  signed?: boolean;
  /** Columns this row uses, overriding the section's (for example a row that only has column B). */
  cols?: ("A" | "B")[];
  /** With `f`: compute only these columns; the other columns of the row are typed. */
  computedCols?: ("A" | "B")[];
  /** Only computed when this holds (for example only for the chosen tax rate). */
  when?: (c: Calc) => boolean;
}
export type Line = RowSpec | { heading: string };
export interface SectionSpec { id: string; title: string; note?: string; lines: Line[]; cols?: ("A" | "B")[] }

export interface PenaltySpec {
  /** Row ids: tax payable to base the penalty on, surcharge, interest, compromise (typed), total penalties, grand total. */
  base: string; surcharge: string; interest: string; compromise?: string; total: string; grand: string;
  /** The gross sales used to classify the taxpayer when the case does not state it. */
  gross?: (c: Calc) => number;
  /** Taxpayer classification read from the form (for example a Micro/Small/Medium/Large box), used when the case does not state one. */
  klass?: (v: Values) => Classification | undefined;
  /** Columns to compute penalties for. Default: every column in use. */
  cols?: ("A" | "B")[];
}

export interface FormSpec {
  id: string; number: string; title: string; subtitle: string; version: string; versionNote?: string;
  /** Identity rows (period, TIN, RDO, name, address and so on) and the required ids among them. */
  identity: Row[];
  identityTitle?: string;
  required: { id: string; message?: string }[];
  formats?: { tin?: string[]; rdo?: string[]; zip?: string[]; email?: string[] };
  sections: SectionSpec[];
  /** Sections [0, split) stay on page 1 with the identity rows, the rest go to page 2. Omit for one page. */
  split?: number;
  spouse?: (v: Values) => boolean;
  colLabels?: [string, string];
  yearId?: string;
  penalty?: PenaltySpec;
  due: (v: Values) => string;
  extraValidate?: (v: Values, ctx: ComputeContext, computed: Values) => Issue[];
  /** Ids (besides the rows) to score, with weights. */
  scoreExtra?: { id: string; weight?: number }[];
}

const cols = (s: SectionSpec, spouseOn: boolean, l?: RowSpec): ("A" | "B")[] => (l?.cols ?? s.cols ?? ["A", "B"]).filter((c) => c === "A" || spouseOn);

export function makeForm(spec: FormSpec): FormDef {
  const spouseOn = spec.spouse ?? (() => false);
  const rowOf = (l: RowSpec, s: SectionSpec): Row => ({ type: "amounts", id: l.id, item: l.item, label: l.label, mode: l.f && !l.computedCols ? "computed" : "input", computedCols: l.computedCols, cols: l.cols ?? s.cols ?? (spec.spouse ? ["A", "B"] : ["A"]), indent: l.indent, bold: l.bold, specify: l.specify });
  const toSection = (s: SectionSpec): Section => ({ id: s.id, title: s.title, note: s.note, rows: s.lines.map((l): Row => ("heading" in l ? { type: "heading", text: l.heading } : rowOf(l, s))) });
  const head: Section = { id: "identity", title: spec.identityTitle ?? `BIR Form No. ${spec.number}`, note: spec.subtitle, rows: spec.identity };
  const body = spec.sections.map(toSection);
  const split = spec.split ?? 0;
  const pages: Page[] = split > 0 ? [{ id: "p1", title: "Page 1", sections: [head, ...body.slice(0, split)] }, { id: "p2", title: "Page 2", sections: body.slice(split) }] : [{ id: "p1", title: "Page 1", sections: [head, ...body] }];
  const allRows = spec.sections.flatMap((s) => s.lines.filter((l): l is RowSpec => !("heading" in l)).map((l) => ({ l, s })));
  const yearOf = (v: Values) => { const m = (v[spec.yearId ?? "1"] ?? "").match(/(\d{4})$/); return m ? Number(m[1]) : 0; };

  function compute(v: Values, ctx: ComputeContext): Values {
    const out: Values = {};
    const put = (id: string, c: number) => { out[id] = (c / 100).toFixed(2); };
    const colsOn: ("A" | "B")[] = spouseOn(v) ? ["A", "B"] : ["A"];
    // Rows may depend on rows listed later (Part II reads Part V) or on the other column (totals), so settle the values in several passes.
    for (let pass = 0; pass < 8; pass++) for (const col of colsOn) {
      const read = (id: string) => (id + col in out ? amt(out[id + col]) : amt(v[id + col]));
      const both = (id: string) => ["A", "B"].reduce((a, k) => a + (id + k in out ? amt(out[id + k]) : amt(v[id + k])), 0);
      const at = (id: string, k: "A" | "B") => (id + k in out ? amt(out[id + k]) : amt(v[id + k]));
      const calc: Calc = { n: read, at, both, v, col, year: yearOf(v), ctx, text: (id) => v[id] ?? "" };
      for (const { l, s } of allRows) {
        if (!l.f || !cols(s, true, l).includes(col)) continue;
        if (l.computedCols && !l.computedCols.includes(col)) continue;
        if (l.when && !l.when(calc)) continue;
        put(l.id + col, l.f(calc));
      }
    }
    const p = spec.penalty;
    if (p) for (const col of p.cols ?? colsOn) {
      const read = (id: string) => (id + col in out ? amt(out[id + col]) : amt(v[id + col]));
      const calc: Calc = { n: read, at: (id, k) => (id + k in out ? amt(out[id + k]) : amt(v[id + k])), both: read, v, col, year: yearOf(v), ctx, text: (id) => v[id] ?? "" };
      const pen = penaltiesFor(Math.max(read(p.base), 0), spec.due(v), ctx.filingDate, ctx.classification ?? p.klass?.(v) ?? classify(p.gross ? p.gross(calc) : 0));
      put(p.surcharge + col, pen.surcharge); put(p.interest + col, pen.interest);
      const tot = pen.surcharge + pen.interest + (p.compromise ? read(p.compromise) : 0);
      put(p.total + col, tot); put(p.grand + col, read(p.base) + tot);
    }
    return out;
  }

  function validate(v: Values, ctx: ComputeContext): Issue[] {
    const issues: Issue[] = [];
    const bad = (id: string, item: string, message: string) => issues.push({ id, item, message });
    const blank = (id: string) => !(v[id] ?? "").trim();
    for (const r of spec.required) if (blank(r.id)) bad(r.id, r.id, r.message ?? `Item ${r.id} is required.`);
    for (const id of spec.formats?.tin ?? []) if (!blank(id) && !isTin(v[id])) bad(id, id, "TIN must be 3-3-3-5 digits (for example 000-000-000-00000).");
    for (const id of spec.formats?.rdo ?? []) if (!blank(id) && !isRdo(v[id])) bad(id, id, "RDO code must be 3 digits.");
    for (const id of spec.formats?.zip ?? []) if (!blank(id) && !/^\d{4}$/.test(v[id])) bad(id, id, "ZIP code must be 4 digits.");
    for (const id of spec.formats?.email ?? []) if (!blank(id) && !isEmail(v[id])) bad(id, id, "The email address is not valid.");
    const computed = compute(v, ctx);
    for (const { l, s } of allRows) {
      if (l.f && !l.computedCols) continue;
      for (const col of cols(s, spouseOn(v), l)) {
        if (l.computedCols?.includes(col)) continue;
        const id = l.id + col;
        if (amt(v[id]) < 0 && !l.signed) bad(id, l.item, `Item ${l.item}${col} cannot be negative.`);
        if (hasCentavos(v[id])) bad(id, l.item, `Item ${l.item}${col}: do not enter centavos on this form.`);
        if (l.specify && amt(v[id]) > 0 && blank(l.id + "S")) bad(l.id + "S", l.item, `Specify what Item ${l.item} is.`);
      }
    }
    if (spec.extraValidate) issues.push(...spec.extraValidate(v, ctx, computed));
    const order = (x: Issue) => parseFloat(x.item.replace(/[^\d.]/g, "")) || 0;
    return issues.sort((a, b) => order(a) - order(b));
  }

  function scoring(v: Values) {
    const out: { id: string; item: string; weight: number }[] = [];
    for (const { l, s } of allRows) for (const c of cols(s, spouseOn(v), l)) out.push({ id: l.id + c, item: l.item, weight: l.key ? 3 : 1 });
    for (const e of spec.scoreExtra ?? []) out.push({ id: e.id, item: e.id, weight: e.weight ?? 1 });
    return out;
  }

  return { id: spec.id, number: spec.number, title: spec.title, subtitle: spec.subtitle, version: spec.version, versionNote: spec.versionNote, pages, spouseOn: spec.spouse, colLabels: spec.colLabels, compute, validate, dueDate: spec.due, scoring };
}
