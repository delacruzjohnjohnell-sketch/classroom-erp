// The shape of a BIR form definition. One generic renderer draws any of them; the numbers come from `compute`, the checks from `validate`.
export type Values = Record<string, string>;

export type FieldKind = "text" | "tin" | "rdo" | "zip" | "email" | "phone" | "monthyear" | "date" | "yesno" | "radio" | "amount" | "count";
export interface Option { value: string; label: string }

/** One numbered item that is not an amount row (identity, choices, dates). */
export interface FieldDef {
  id: string;
  item: string;
  label: string;
  kind: FieldKind;
  options?: Option[];
  /** Grid columns it spans out of 12. */
  span?: number;
  required?: boolean;
  /** Shown only when this returns true (for example the spouse items). */
  when?: (v: Values) => boolean;
}

export type Row =
  | { type: "fields"; fields: FieldDef[] }
  /** An amount row: item number, label, and one or two columns (A taxpayer, B spouse). `id` + "A"/"B" are the value ids. */
  | { type: "amounts"; id: string; item: string; label: string; mode: "input" | "computed"; cols: ("A" | "B")[]; indent?: 0 | 1 | 2; bold?: boolean; whole?: boolean; note?: string; /** Show a small "specify" text box beside the label (id + "S"). */ specify?: boolean }
  | { type: "heading"; text: string; note?: string }
  /** Part III: item, particulars, then bank, number, date, amount. */
  | { type: "payment"; id: string; item: string; label: string };

export interface Section { id: string; title: string; note?: string; rows: Row[] }
export interface Page { id: string; title: string; sections: Section[] }

export interface Issue { id: string; item: string; message: string }

export interface ComputeContext {
  /** The date the return is filed (ISO). Late filing adds surcharge and interest. */
  filingDate?: string;
}

export interface FormDef {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  /** Version label as printed on the form, for example "January 2018". */
  version: string;
  versionNote?: string;
  pages: Page[];
  /** Everything the form works out by itself, from the typed values. */
  compute(values: Values, ctx: ComputeContext): Values;
  validate(values: Values, ctx: ComputeContext): Issue[];
  /** The due date for the taxable year in the values (ISO), or "" when the year is not entered. */
  dueDate(values: Values): string;
  /** The item ids a case is scored on, with their weights (default 1). */
  scoring(values: Values): { id: string; item: string; weight: number }[];
}
