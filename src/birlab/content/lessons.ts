// Every built form's lesson, keyed by form id. Adding a form adds one import and one line here.
import type { Lesson } from "../components/LearnPage";
import { PACKS } from "../pack";
import { casesFor } from "../cases";
import * as L1700 from "./f1700";
import * as L1701 from "./f1701";
import * as L1701A from "./f1701a";
import * as L1701Q from "./f1701q";

type Content = { AS_OF: string; LECTURE: Lesson["lecture"]; GUIDE: Lesson["guide"]; TIPS: Lesson["tips"]; QUIZ: Lesson["quiz"] };
const build = (id: string, c: Content): Lesson => ({ asOf: c.AS_OF, lecture: c.LECTURE, guide: c.GUIDE, tips: c.TIPS, quiz: c.QUIZ, cases: casesFor(id) });

export const LESSONS: Record<string, Lesson> = {
  "1700": build("1700", L1700),
  "1701": build("1701", L1701),
  "1701A": build("1701A", L1701A),
  "1701Q": build("1701Q", L1701Q),
  ...Object.fromEntries(PACKS.map((p) => [p.id, { ...p.body, cases: casesFor(p.id) }])),
};
