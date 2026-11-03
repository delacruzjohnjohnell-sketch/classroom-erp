// Every form added from Phase 2b on: its definition, lesson and cases in one place. registry.ts, cases/index.ts and content/lessons.ts read from here.
import type { CaseDef } from "../cases/types";
import type { FormDef } from "../forms/types";
import type { LessonBody } from "./kit";
import * as F0619E from "./f0619e";
import * as F1601C from "./f1601c";
import * as F1601EQ from "./f1601eq";
import * as F1604C from "./f1604c";
import * as F1604E from "./f1604e";
import * as F1606 from "./f1606";
import * as F1701MS from "./f1701ms";
import * as F1706 from "./f1706";
import * as F1707 from "./f1707";
import * as F1702EX from "./f1702ex";
import * as F1702MX from "./f1702mx";
import * as F1702Q from "./f1702q";
import * as F1702RT from "./f1702rt";
import * as F1800 from "./f1800";
import * as F1801 from "./f1801";
import * as F2000 from "./f2000";
import * as F2000OT from "./f2000ot";
import * as F2307 from "./f2307";
import * as F2550Q from "./f2550q";
import * as F2550M from "./f2550m";
import * as F2551Q from "./f2551q";
import * as F2316 from "./f2316";

export interface Pack { id: string; def: FormDef; body: LessonBody; cases: CaseDef[] }
export const PACKS: Pack[] = [
  { id: "1701-MS", def: F1701MS.DEF, body: F1701MS.BODY, cases: F1701MS.CASES },
  { id: "1702-RT", def: F1702RT.DEF, body: F1702RT.BODY, cases: F1702RT.CASES },
  { id: "1702-EX", def: F1702EX.DEF, body: F1702EX.BODY, cases: F1702EX.CASES },
  { id: "1702-MX", def: F1702MX.DEF, body: F1702MX.BODY, cases: F1702MX.CASES },
  { id: "1702Q", def: F1702Q.DEF, body: F1702Q.BODY, cases: F1702Q.CASES },
  { id: "2316", def: F2316.DEF, body: F2316.BODY, cases: F2316.CASES },
  { id: "2307", def: F2307.DEF, body: F2307.BODY, cases: F2307.CASES },
  { id: "1604-C", def: F1604C.DEF, body: F1604C.BODY, cases: F1604C.CASES },
  { id: "1604-E", def: F1604E.DEF, body: F1604E.BODY, cases: F1604E.CASES },
  { id: "1706", def: F1706.DEF, body: F1706.BODY, cases: F1706.CASES },
  { id: "1707", def: F1707.DEF, body: F1707.BODY, cases: F1707.CASES },
  { id: "2550Q", def: F2550Q.DEF, body: F2550Q.BODY, cases: F2550Q.CASES },
  { id: "2551Q", def: F2551Q.DEF, body: F2551Q.BODY, cases: F2551Q.CASES },
  { id: "1601-C", def: F1601C.DEF, body: F1601C.BODY, cases: F1601C.CASES },
  { id: "0619-E", def: F0619E.DEF, body: F0619E.BODY, cases: F0619E.CASES },
  { id: "1601-EQ", def: F1601EQ.DEF, body: F1601EQ.BODY, cases: F1601EQ.CASES },
  { id: "1606", def: F1606.DEF, body: F1606.BODY, cases: F1606.CASES },
  { id: "2000", def: F2000.DEF, body: F2000.BODY, cases: F2000.CASES },
  { id: "2000-OT", def: F2000OT.DEF, body: F2000OT.BODY, cases: F2000OT.CASES },
  { id: "2550M", def: F2550M.DEF, body: F2550M.BODY, cases: F2550M.CASES },
  { id: "1801", def: F1801.DEF, body: F1801.BODY, cases: F1801.CASES },
  { id: "1800", def: F1800.DEF, body: F1800.BODY, cases: F1800.CASES },
];
export const packDef = (id: string): FormDef | undefined => PACKS.find((p) => p.id === id)?.def;
