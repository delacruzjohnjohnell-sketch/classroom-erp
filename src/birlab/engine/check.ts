// "Check my return": compares what a student filled in with the answer key of a case, item by item.
// The key is the same form computation run on the case's facts, so the key can never disagree with the form.
import type { ComputeContext, FormDef, Values } from "../forms/types";
import { amt } from "./tax";

export type ItemStatus = "correct" | "wrong" | "not-required";
export interface ItemResult { id: string; item: string; status: ItemStatus; weight: number; expected?: string; got?: string }
export interface CheckResult { items: ItemResult[]; score: number; max: number; percent: number; wrongForm?: { chosen: string; correct: string; why: string } }

/** Peso tolerance for rounding differences, as the spec asks: plus or minus 1.00 peso. */
export const TOLERANCE = 100;

/** The full set of values of a correct return: the case's identity and facts plus everything the form computes. */
export function keyValues(def: FormDef, given: Values, ctx: ComputeContext): Values {
  return { ...given, ...def.compute(given, ctx) };
}

const CHOICE_IDS = new Set(["1", "2", "6", "7", "19"]);

/** What the student's form shows: their typed values plus what the form computed from them. */
export const shown = (def: FormDef, values: Values, ctx: ComputeContext): Values => ({ ...values, ...def.compute(values, ctx) });

export function checkReturn(def: FormDef, key: Values, student: Values, ctx: ComputeContext): CheckResult {
  const mine = shown(def, student, ctx);
  const items: ItemResult[] = [];
  for (const s of def.scoring(key)) {
    const expected = key[s.id] ?? "";
    const got = mine[s.id] ?? "";
    const isChoice = CHOICE_IDS.has(s.id);
    // An amount item that is zero in the key and blank in the student's form is not required.
    if (!isChoice && amt(expected) === 0 && amt(got) === 0) { items.push({ id: s.id, item: s.item, status: "not-required", weight: 0 }); continue; }
    const ok = isChoice ? expected === got : Math.abs(amt(expected) - amt(got)) <= TOLERANCE;
    items.push({ id: s.id, item: s.item, status: ok ? "correct" : "wrong", weight: s.weight, expected, got });
  }
  const max = items.reduce((a, i) => a + i.weight, 0);
  const score = items.filter((i) => i.status === "correct").reduce((a, i) => a + i.weight, 0);
  return { items, score, max, percent: max ? Math.round((score / max) * 100) : 0 };
}

/** Choosing the wrong form for a case is an automatic zero, with the reason. */
export function wrongFormResult(chosen: string, correct: string, why: string): CheckResult {
  return { items: [], score: 0, max: 1, percent: 0, wrongForm: { chosen, correct, why } };
}
