// Phase 2 and later: every case of every form must validate clean, score 100% on its own key, and carry the hand-computed figures below.
import { describe, expect, it } from "vitest";
import { ALL_CASES } from "../cases";
import { checkReturn, keyValues } from "../engine/check";
import { amt } from "../engine/tax";
import { getForm } from "../forms/registry";

/** Hand-computed key figures per case (pesos), worked out from the case's solution text, not from the code. */
const HAND: Record<string, Record<string, number>> = {
  "1700-easy": { "42A": 600000, "44A": 540000, "47A": 50500, "54A": 40500, "28A": 10000, "35A": 10000 },
  "1700-average": { "42A": 800000, "44A": 670000, "46A": 700000, "47A": 82500, "54A": 65000, "28A": 17500, "30A": 8750, "35A": 8750 },
  "1700-difficult": { "47A": 42500, "28A": 18500, "31A": 4625, "32A": 280, "34A": 5905, "35A": 24405, "47B": 62500, "28B": 24500, "31B": 6125, "32B": 371, "34B": 7496, "35B": 31996 },
  "1701Q-easy": { "49A": 400000, "53A": 150000, "54A": 12000, "62A": 2000, "63A": 10000, "68A": 10000 },
  "1701Q-average": { "38A": 500000, "41A": 320000, "45A": 430000, "46A": 28500, "62A": 9000, "63A": 19500, "68A": 19500 },
  "1701Q-difficult": { "49A": 720000, "51A": 1720000, "53A": 1470000, "54A": 117600, "62A": 82000, "63A": 35600, "64A": 3560, "65A": 146, "67A": 4706, "68A": 40306 },
  "1701-easy": { s6A: 330000, s17A: 80000, s18A: 120000, s24A: 450000, s25A: 32500, c10A: 18000, p24A: 14500, p31A: 14500 },
  "1701-average": { s6A: 550000, s7A: 52500, s28A: 500000, s29A: 0, s31A: 40000, s32A: 92500, c10A: 70000, p24A: 22500, p26A: 12500, p31A: 12500 },
  "1701-difficult": { s12A: 1600000, s13A: 700000, s16A: 750000, s18A: 850000, s24A: 1320000, s25A: 232500, c10A: 158000, p24A: 74500, p28A: 7450, p27A: 931, p30A: 10381, p31A: 84881 },
  "1701-MS-easy": { b7A: 450000, b11A: 180000, b12A: 270000, b18BA: 3000, v10A: 1000, m25A: 2000, m29A: 2000 },
  "1701-MS-average": { b21A: 1520000, b23A: 1270000, b24A: 101600, b25A: 101600, v10A: 90000, m25A: 11600, m27A: 1600, m29A: 1600 },
  "1701-MS-difficult": { c3A: 400000, b7A: 3400000, b10DA: 2000000, b12A: 1400000, b15A: 1840000, b18BA: 362500, v10A: 185000, m27A: 177500, m28AA: 17750, m28BA: 1342, m28DA: 22092, m29A: 199592 },
  "1702-RT-easy": { "29A": 8000000, "33A": 3100000, "34A": 1600000, "39A": 1500000, "41A": 375000, "42A": 62000, "43A": 375000, "55A": 200000, "16A": 175000, "21A": 175000 },
  "1702-RT-average": { "33A": 5000000, "34A": 4800000, "39A": 200000, "41A": 40000, "42A": 100000, "43A": 100000, "55A": 33000, "16A": 67000, "21A": 67000 },
  "1702-RT-difficult": { "29A": 8500000, "33A": 6000000, "38A": 2400000, "39A": 3600000, "41A": 720000, "42A": 120000, "55A": 375000, "16A": 345000, "17A": 34500, "18A": 2495, "20A": 41995, "21A": 386995 },
};

describe("every case of every built form", () => {
  for (const c of ALL_CASES) {
    const def = getForm(c.form)?.def;
    it(`${c.id}: validates clean and scores 100% on its own key`, () => {
      expect(def, `form ${c.form} has a definition`).toBeTruthy();
      if (!def) return;
      const ctx = { filingDate: c.filingDate, classification: c.classification };
      const given = { ...c.profile, ...c.facts };
      expect(def.validate(given, ctx)).toEqual([]);
      const res = checkReturn(def, keyValues(def, given, ctx), given, ctx);
      expect(res.percent).toBe(100);
      expect(res.max).toBeGreaterThan(0);
    });
    it(`${c.id}: has a story, hints, a solution and the right form`, () => {
      expect(c.story.length).toBeGreaterThan(0);
      expect(c.hints.length).toBeGreaterThanOrEqual(2);
      expect(c.solution.length).toBeGreaterThanOrEqual(1);
      expect(c.correctForm).toBe(c.form);
    });
    const want = HAND[c.id];
    if (want) {
      it(`${c.id}: key matches the hand-computed figures`, () => {
        if (!def) return;
        const key = keyValues(def, { ...c.profile, ...c.facts }, { filingDate: c.filingDate, classification: c.classification });
        for (const [id, pesos] of Object.entries(want)) expect(amt(key[id]), `${c.id} item ${id}`).toBe(pesos * 100);
      });
    }
  }
});

/** Every id a student can type into on a form: field ids, row ids with a column letter, "specify" boxes and payment cells. */
function typableIds(def: NonNullable<ReturnType<typeof getForm>>["def"]): Set<string> {
  const ids = new Set<string>();
  for (const page of def?.pages ?? []) for (const sec of page.sections) for (const row of sec.rows) {
    if (row.type === "fields") row.fields.forEach((f) => ids.add(f.id));
    else if (row.type === "amounts") { row.cols.forEach((c) => ids.add(row.id + c)); ids.add(row.id + "S"); }
    else if (row.type === "payment") ["bank", "no", "date", "amt"].forEach((k) => ids.add(`${row.id}${k}`));
  }
  return ids;
}

describe("case facts only use ids that exist on the form", () => {
  for (const c of ALL_CASES) {
    it(c.id, () => {
      const ids = typableIds(getForm(c.form)?.def);
      for (const k of [...Object.keys(c.profile), ...Object.keys(c.facts)]) expect(ids.has(k), `${c.id}: unknown id ${k}`).toBe(true);
    });
  }
});

describe("case library", () => {
  it("has easy, average and difficult for every built form", () => {
    const own = ALL_CASES.filter((c) => !c.scenario);
    const forms = new Set(own.map((c) => c.form));
    for (const f of forms) expect(own.filter((c) => c.form === f).map((c) => c.level).sort()).toEqual(["average", "difficult", "easy"]);
  });
  it("uses only fictional 000- TINs", () => {
    for (const c of ALL_CASES) for (const v of [...Object.values(c.profile), ...Object.values(c.facts)]) if (/^\d{3}-\d{3}-\d{3}-\d{5}$/.test(v)) expect(v.startsWith("000-")).toBe(true);
  });
});
