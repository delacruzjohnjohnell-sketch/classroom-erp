// The shape of a case problem, shared by every form's cases.
import type { Classification } from "../engine/tax";
import type { Values } from "../forms/types";

export type Level = "easy" | "average" | "difficult";

export interface CaseDef {
  id: string;
  form: string;
  level: Level;
  /** The taxable year the case is about. Its tax table is that year's (rules/2026.ts). */
  year: number;
  title: string;
  story: string[];
  /** Part I background, prefilled like the eBIRForms taxpayer profile. */
  profile: Values;
  /** Everything else the student must enter or choose. */
  facts: Values;
  /** The date the return is actually filed (ISO). */
  filingDate: string;
  /** Taxpayer classification the story states, for the late-filing penalty rates (micro and small taxpayers pay less). */
  classification?: Classification;
  /** Which form the story calls for, and why (a wrong choice scores zero). */
  correctForm: string;
  whyForm: string;
  /** Practice-mode hints, shown one at a time. */
  hints: string[];
  /** The worked solution in plain steps, shown only after the return is final. */
  solution: string[];
  /** Set on the cases that belong to a cross-form scenario (they are listed under Scenarios, not under the form's own case problems). */
  scenario?: string;
}
