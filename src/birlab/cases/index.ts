// Every case of every built form, in one place.
import { CASES_1700 } from "./f1700";
import { CASES_1701 } from "./f1701";
import { CASES_1701A } from "./f1701a";
import { CASES_1701Q } from "./f1701q";
import { PACKS } from "../pack";
import { SCENARIO_CASES } from "./scenarios";
import type { CaseDef } from "./types";

export const ALL_CASES: CaseDef[] = [...SCENARIO_CASES, ...CASES_1701A, ...CASES_1701Q, ...CASES_1700, ...CASES_1701, ...PACKS.flatMap((p) => p.cases)];
export const getCase = (id: string): CaseDef | undefined => ALL_CASES.find((c) => c.id === id);
export const casesFor = (formId: string): CaseDef[] => ALL_CASES.filter((c) => c.form === formId && !c.scenario);
