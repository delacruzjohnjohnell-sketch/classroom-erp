import { describe, expect, it } from "vitest";
import { RULES, unverifiedRules } from "../rules/2026";
import { amt, annualReturnDue, bracketsFor, classify, daysBetween, eightPercentTax, graduatedTax, hasCentavos, isEmail, isoToUs, isRdo, isTin, optionalStandardDeduction, penaltiesFor, roundToPeso, usToIso } from "../engine/tax";
import { checkReturn, keyValues, wrongFormResult } from "../engine/check";
import { F1701A } from "../forms/f1701a";
import { FORMS, availableForms, getForm } from "../forms/registry";
import { CASES_1701A, getCase } from "../cases/f1701a";
import type { Values } from "../forms/types";

const P = (pesos: number) => pesos * 100;
const peso = (c: string | undefined) => amt(c) / 100;

describe("tax engine", () => {
  it("rounds to whole pesos: 49 centavos or less drop, 50 or more round up", () => {
    expect(roundToPeso(10049)).toBe(10000);
    expect(roundToPeso(10050)).toBe(10100);
    expect(roundToPeso(-10049)).toBe(-10000);
    expect(roundToPeso(-10050)).toBe(-10100);
  });
  it("parses typed amounts", () => {
    expect(amt("1,250,000")).toBe(P(1250000));
    expect(amt("₱1,250,000.50")).toBe(125000050);
    expect(amt("")).toBe(0);
    expect(amt("abc")).toBe(0);
    expect(amt("-500")).toBe(-50000);
    expect(hasCentavos("100.25")).toBe(true);
    expect(hasCentavos("100.00")).toBe(false);
  });
  it("applies the 2023-onwards graduated table (Table 2 of Form 1701A) at every bracket edge", () => {
    expect(graduatedTax(P(250000), 2025)).toBe(0);
    expect(graduatedTax(P(312000), 2025)).toBe(P(9300));
    expect(graduatedTax(P(400000), 2025)).toBe(P(22500));
    expect(graduatedTax(P(800000), 2025)).toBe(P(102500));
    expect(graduatedTax(P(1400000), 2025)).toBe(P(252500));
    expect(graduatedTax(P(2000000), 2025)).toBe(P(402500));
    expect(graduatedTax(P(8000000), 2025)).toBe(P(2202500));
    expect(graduatedTax(P(10000000), 2025)).toBe(P(2902500));
    expect(graduatedTax(-P(1), 2025)).toBe(0);
  });
  it("uses Table 1 for taxable years 2018 to 2022", () => {
    expect(graduatedTax(P(400000), 2020)).toBe(P(30000));
    expect(graduatedTax(P(800000), 2020)).toBe(P(130000));
    expect(graduatedTax(P(2000000), 2022)).toBe(P(490000));
    expect(bracketsFor(2022)).toBe(RULES.individualTable2018.brackets);
    expect(bracketsFor(2023)).toBe(RULES.individualTable2023.brackets);
  });
  it("computes the 8% option and the optional standard deduction", () => {
    expect(eightPercentTax(P(1575000))).toBe(P(126000));
    expect(eightPercentTax(-P(5))).toBe(0);
    expect(optionalStandardDeduction(P(520000))).toBe(P(208000));
    expect(optionalStandardDeduction(-P(1))).toBe(0);
  });
  it("classifies taxpayers by gross sales", () => {
    expect(classify(P(2999999))).toBe("micro");
    expect(classify(P(3000000))).toBe("small");
    expect(classify(P(19999999))).toBe("small");
    expect(classify(P(20000000))).toBe("medium");
    expect(classify(P(1000000000))).toBe("large");
  });
  it("computes dates and the annual due date", () => {
    expect(daysBetween("2026-04-15", "2026-06-30")).toBe(76);
    expect(daysBetween("2026-04-15", "2026-04-15")).toBe(0);
    expect(annualReturnDue(2025)).toBe("2026-04-15");
    expect(usToIso("04/15/2026")).toBe("2026-04-15");
    expect(usToIso("02/30/2026")).toBe("");
    expect(usToIso("4/15/2026")).toBe("");
    expect(isoToUs("2026-04-15")).toBe("04/15/2026");
  });
  it("adds surcharge and interest for late filing: general 25%/12%, micro and small 10%/6%", () => {
    const small = penaltiesFor(P(98500), "2026-04-15", "2026-06-30", "micro");
    expect(small).toMatchObject({ late: true, days: 76, surcharge: P(9850), interest: P(1231), surchargeRate: 0.1, interestRate: 0.06 });
    const general = penaltiesFor(P(100000), "2026-04-15", "2026-06-30", "medium");
    expect(general).toMatchObject({ late: true, days: 76, surcharge: P(25000), interest: P(2499) }); // 100,000 × 12% × 76/365 = 2,498.63
    expect(penaltiesFor(P(100000), "2026-04-15", "2026-04-15", "medium").late).toBe(false);
    expect(penaltiesFor(P(100000), "2026-04-15", "2026-04-01", "medium").late).toBe(false);
    expect(penaltiesFor(0, "2026-04-15", "2026-06-30", "micro").late).toBe(false);
    expect(penaltiesFor(-P(500), "2026-04-15", "2026-06-30", "micro").late).toBe(false);
    expect(penaltiesFor(P(100000), "2026-04-15", "2026-06-30", "large", true).surcharge).toBe(P(50000)); // willful 50%
  });
  it("checks identifiers", () => {
    expect(isTin("000-000-001-00000")).toBe(true);
    expect(isTin("000-000-001-0000")).toBe(false);
    expect(isTin("000000001")).toBe(false);
    expect(isRdo("025")).toBe(true);
    expect(isRdo("25")).toBe(false);
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
  });
});

describe("rules file", () => {
  it("lists every unverified rule so the phase report can flag it", () => {
    const list = unverifiedRules().map((r) => r.rule);
    expect(list).toEqual(expect.arrayContaining(["corporate", "classification"]));
    expect(list.some((r) => r.startsWith("penalties"))).toBe(false); // verified against the 2550Q Guidelines
    expect(list).not.toContain("individualTable2023");
  });
  it("carries a date and legal basis on every rule", () => {
    for (const k of ["individualTable2023", "individualTable2018", "eightPercent", "osd", "annualIndividualDue", "installment", "classification"] as const) {
      expect(RULES[k].effectiveFrom, k).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(RULES[k].basis.length, k).toBeGreaterThan(5);
    }
  });
});

describe("form registry", () => {
  it("lists every form in the spec and marks the built ones", () => {
    expect(FORMS.map((f) => f.id)).toEqual(expect.arrayContaining(["1700", "1701", "1701A", "1701-MS", "1701Q", "1702-RT", "1702-EX", "1702-MX", "1702Q", "2316", "2307", "1604-C", "1604-E", "1706", "1707", "2550Q", "2550M", "2551Q", "1601-C", "0619-E", "1601-EQ", "1606", "2000", "2000-OT", "1800", "1801"]));
    expect(availableForms().map((f) => f.id)).toContain("1701A");
    expect(getForm("1701A")?.def?.version).toBe("January 2018");
    expect(new Set(FORMS.map((f) => f.id)).size).toBe(FORMS.length);
  });
});

// ---- the form ---------------------------------------------------------------------------------------------------------------------------------------

const base: Values = {
  "1": "12/2025", "2": "no", "3": "no", "4": "000-000-001-00000", "5": "025", "6": "single", "7": "II012", "8": "BAUTISTA, ROSARIO, MENDOZA", "9": "BRGY. SUMACAB ESTE, CABANATUAN CITY", "9A": "3100",
  "10": "03/14/1978", "11": "r@example.com", "12": "FILIPINO", "13": "no", "15": "09170000001", "16": "single", "19": "graduated", "36A": "520000", "37A": "0", "31": "0",
};
const ctx = { filingDate: "2026-04-10" };
const issues = (v: Values, c = ctx) => F1701A.validate(v, c);

describe("1701A computation (hand-checked)", () => {
  it("computes the graduated/OSD path", () => {
    const c = F1701A.compute(base, ctx);
    expect(peso(c["38A"])).toBe(520000);
    expect(peso(c["39A"])).toBe(208000);
    expect(peso(c["40A"])).toBe(312000);
    expect(peso(c["45A"])).toBe(312000);
    expect(peso(c["46A"])).toBe(9300);
    expect(peso(c["20A"])).toBe(9300);
    expect(peso(c["65A"])).toBe(9300);
    expect(peso(c["24A"])).toBe(9300);
    expect(peso(c["29A"])).toBe(9300);
    expect(peso(c["30A"])).toBe(9300);
    expect(c["56A"]).toBeUndefined(); // the 8% lines stay empty
  });
  it("computes the 8% path with its P250,000 reduction", () => {
    const c = F1701A.compute({ ...base, "19": "eight", "6": "professional", "7": "II017", "47A": "1850000", "48A": "50000", "50A": "25000" }, ctx);
    expect(peso(c["49A"])).toBe(1800000);
    expect(peso(c["53A"])).toBe(1825000);
    expect(peso(c["54A"])).toBe(250000);
    expect(peso(c["55A"])).toBe(1575000);
    expect(peso(c["56A"])).toBe(126000);
    expect(c["46A"]).toBeUndefined();
  });
  it("deducts credits and the second installment", () => {
    const c = F1701A.compute({ ...base, "36A": "1000000", "58A": "20000", "59A": "5000", "23A": "10000" }, ctx);
    // net 1,000,000; OSD 400,000; taxable 600,000; tax 22,500 + 20% × 200,000 = 62,500
    expect(peso(c["46A"])).toBe(62500);
    expect(peso(c["64A"])).toBe(25000);
    expect(peso(c["22A"])).toBe(37500);
    expect(peso(c["24A"])).toBe(27500);
  });
  it("shows an overpayment as a negative payable and charges no penalty on it", () => {
    const c = F1701A.compute({ ...base, "58A": "20000" }, { filingDate: "2026-09-01" });
    expect(peso(c["65A"])).toBe(-10700);
    expect(peso(c["24A"])).toBe(-10700);
    expect(peso(c["25A"])).toBe(0);
    expect(peso(c["26A"])).toBe(0);
  });
  it("adds micro-taxpayer penalties when filed late (and none on time)", () => {
    const late = F1701A.compute({ ...base, "27A": "500" }, { filingDate: "2026-06-30" });
    // payable 9,300: surcharge 10% = 930; interest 9,300 × 6% × 76/365 = 116.19 -> 116; compromise 500
    expect(peso(late["25A"])).toBe(930);
    expect(peso(late["26A"])).toBe(116);
    expect(peso(late["28A"])).toBe(1546);
    expect(peso(late["29A"])).toBe(10846);
    expect(peso(F1701A.compute(base, ctx)["25A"])).toBe(0);
  });
  it("computes a joint return separately for the spouse column", () => {
    const v = { ...base, "16": "married", "17": "yes", "18": "joint", "75": "graduated", "36B": "400000" };
    const c = F1701A.compute(v, ctx);
    expect(peso(c["46A"])).toBe(9300);
    // spouse: net 400,000; OSD 160,000; taxable 240,000; tax 0
    expect(peso(c["45B"])).toBe(240000);
    expect(peso(c["46B"])).toBe(0);
    expect(peso(c["30A"])).toBe(9300);
  });
  it("uses the old table for a taxable year in 2018-2022", () => {
    const c = F1701A.compute({ ...base, "1": "12/2021", "36A": "1000000" }, { filingDate: "2022-04-15" });
    // taxable 600,000: Table 1 = 30,000 + 25% × 200,000 = 80,000
    expect(peso(c["46A"])).toBe(80000);
  });
  it("reports the due date from the taxable year", () => {
    expect(F1701A.dueDate(base)).toBe("2026-04-15");
    expect(F1701A.dueDate({})).toBe("");
  });
});

describe("1701A validation", () => {
  it("accepts a complete return", () => {
    expect(issues(base)).toEqual([]);
  });
  it("catches missing required items", () => {
    const v = { ...base };
    for (const id of ["2", "3", "4", "5", "6", "7", "8", "9", "9A", "10", "12", "13", "15", "16", "19", "31"]) delete v[id];
    const ids = issues(v).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["2", "3", "4", "5", "6", "7", "8", "9", "9A", "10", "12", "13", "15", "16", "19", "31"]));
  });
  it("catches an invalid TIN, RDO, ZIP and email", () => {
    const ids = issues({ ...base, "4": "123", "5": "25", "9A": "31", "11": "nope" }).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(["4", "5", "9A", "11"]));
  });
  it("catches an ATC that does not match the taxpayer type or the tax rate", () => {
    expect(issues({ ...base, "7": "II014" }).find((i) => i.id === "7")?.message).toMatch(/Professional/);
    expect(issues({ ...base, "7": "II015" }).find((i) => i.id === "7")?.message).toMatch(/8% rate/);
    expect(issues({ ...base, "6": "professional", "7": "II012" }).find((i) => i.id === "7")?.message).toMatch(/Single Proprietor/);
  });
  it("catches negative amounts and centavos", () => {
    expect(issues({ ...base, "37A": "-100" }).some((i) => i.id === "37A")).toBe(true);
    expect(issues({ ...base, "36A": "520000.50" }).some((i) => i.id === "36A" && /centavos/.test(i.message))).toBe(true);
  });
  it("rejects the 8% option above P3,000,000", () => {
    const eight = { ...base, "19": "eight", "7": "II015", "47A": "3000000", "50A": "1", "50S": "X" };
    expect(issues(eight).some((i) => i.id === "19")).toBe(true);
    expect(issues({ ...eight, "47A": "2900000", "50A": "0" }).some((i) => i.id === "19")).toBe(false);
  });
  it("requires specifying other income, and Item 61 on an amended return", () => {
    expect(issues({ ...base, "41A": "5000" }).some((i) => i.id === "41S")).toBe(true);
    expect(issues({ ...base, "2": "yes" }).some((i) => i.id === "61A")).toBe(true);
    expect(issues({ ...base, "2": "yes", "61A": "500" }).some((i) => i.id === "61A")).toBe(false);
  });
  it("limits the second installment to 50% of Item 20 and only when there is a payable", () => {
    expect(issues({ ...base, "23A": "4650" }).some((i) => i.id === "23A")).toBe(false); // exactly 50% of 9,300
    expect(issues({ ...base, "23A": "4700" }).some((i) => i.id === "23A")).toBe(true);
    expect(issues({ ...base, "58A": "9300", "23A": "100" }).some((i) => i.id === "23A")).toBe(true);
  });
  it("requires the overpayment choice and the spouse's items for a joint return", () => {
    expect(issues({ ...base, "58A": "20000" }).some((i) => i.id === "30R")).toBe(true);
    expect(issues({ ...base, "58A": "20000", "30R": "carry" }).some((i) => i.id === "30R")).toBe(false);
    const joint = { ...base, "16": "married", "17": "yes", "18": "joint" };
    expect(issues(joint).map((i) => i.id)).toEqual(expect.arrayContaining(["66", "67", "68", "69", "70", "73", "75"]));
  });
});

// ---- the three cases --------------------------------------------------------------------------------------------------------------------------------

const given = (id: string): Values => { const c = getCase(id)!; return { ...c.profile, ...c.facts }; };
const keyOf = (id: string) => { const c = getCase(id)!; return keyValues(F1701A, given(id), { filingDate: c.filingDate }); };

describe("1701A case keys (hand-computed)", () => {
  it("has an easy, an average and a difficult case, all valid returns", () => {
    expect(CASES_1701A.map((c) => c.level)).toEqual(["easy", "average", "difficult"]);
    for (const c of CASES_1701A) {
      expect(F1701A.validate(given(c.id), { filingDate: c.filingDate }), c.id).toEqual([]);
      expect(c.solution.length).toBeGreaterThan(3);
      expect(c.hints.length).toBeGreaterThan(1);
      expect(c.profile["4"]).toMatch(/^000-000-\d{3}-00000$/);
    }
  });
  it("easy: ₱520,000 sales under graduated/OSD pays ₱9,300 on time", () => {
    const k = keyOf("1701A-easy");
    expect(peso(k["40A"])).toBe(312000);
    expect(peso(k["46A"])).toBe(9300);
    expect(peso(k["65A"])).toBe(9300);
    expect(peso(k["28A"])).toBe(0);
    expect(peso(k["29A"])).toBe(9300);
  });
  it("average: a dentist on 8% with credits pays ₱19,500", () => {
    const k = keyOf("1701A-average");
    expect(peso(k["53A"])).toBe(1825000);
    expect(peso(k["55A"])).toBe(1575000);
    expect(peso(k["56A"])).toBe(126000);
    expect(peso(k["64A"])).toBe(106500);
    expect(peso(k["65A"])).toBe(19500);
    expect(peso(k["29A"])).toBe(19500);
  });
  it("difficult: late filing with micro-taxpayer penalties totals ₱114,581", () => {
    const k = keyOf("1701A-difficult");
    expect(peso(k["38A"])).toBe(2300000);
    expect(peso(k["39A"])).toBe(920000);
    expect(peso(k["45A"])).toBe(1400000);
    expect(peso(k["46A"])).toBe(252500);
    expect(peso(k["64A"])).toBe(154000);
    expect(peso(k["24A"])).toBe(98500);
    expect(peso(k["25A"])).toBe(9850);
    expect(peso(k["26A"])).toBe(1231);
    expect(peso(k["28A"])).toBe(16081);
    expect(peso(k["29A"])).toBe(114581);
  });
});

describe("checking a return against a key", () => {
  const c = getCase("1701A-difficult")!;
  const ctxC = { filingDate: c.filingDate };
  const key = keyOf(c.id);
  it("gives full marks to the correct return", () => {
    const r = checkReturn(F1701A, key, given(c.id), ctxC);
    expect(r.percent).toBe(100);
    expect(r.items.some((i) => i.status === "wrong")).toBe(false);
    expect(r.items.some((i) => i.status === "not-required")).toBe(true);
  });
  it("marks a deliberately wrong entry wrong and carries it through the computation", () => {
    const r = checkReturn(F1701A, key, { ...given(c.id), "41A": "0", "41S": "" }, ctxC);
    expect(r.percent).toBeLessThan(100);
    const wrong = r.items.filter((i) => i.status === "wrong").map((i) => i.id);
    expect(wrong).toEqual(expect.arrayContaining(["41A", "44A", "45A", "46A"]));
  });
  it("accepts a difference of one peso (rounding) and rejects two", () => {
    expect(checkReturn(F1701A, key, { ...given(c.id), "27A": "5001" }, ctxC).items.find((i) => i.id === "27A")?.status).toBe("correct");
    expect(checkReturn(F1701A, key, { ...given(c.id), "27A": "5002" }, ctxC).items.find((i) => i.id === "27A")?.status).toBe("wrong");
  });
  it("catches the wrong tax rate or the old year's table", () => {
    const wrongRate = checkReturn(F1701A, key, { ...given(c.id), "19": "eight", "7": "II015", "47A": "2400000", "48A": "100000" }, ctxC);
    expect(wrongRate.items.find((i) => i.id === "19")?.status).toBe("wrong");
    const oldYear = checkReturn(F1701A, key, { ...given(c.id), "1": "12/2021" }, ctxC);
    expect(oldYear.items.find((i) => i.id === "46A")?.status).toBe("wrong");
  });
  it("scores the tax lines heavier than a plain line", () => {
    const r = checkReturn(F1701A, key, given(c.id), ctxC);
    const w = (id: string) => r.items.find((i) => i.id === id)!.weight;
    expect(w("46A")).toBe(3);
    expect(w("29A")).toBe(3);
    expect(w("38A")).toBe(1);
  });
  it("gives zero for the wrong form, with the reason", () => {
    const r = wrongFormResult("1701", c.correctForm, c.whyForm);
    expect(r).toMatchObject({ score: 0, percent: 0, wrongForm: { chosen: "1701", correct: "1701A" } });
    expect(r.wrongForm?.why.length).toBeGreaterThan(10);
  });
});
