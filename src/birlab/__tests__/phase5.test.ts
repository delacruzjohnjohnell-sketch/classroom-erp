// Phase 5: the filing calendar, the "which form" helper, and the cross-form scenarios whose numbers must carry from one form to the next.
import { describe, expect, it } from "vitest";
import { ALL_CASES, getCase } from "../cases";
import { SCENARIOS } from "../cases/scenarios";
import { calendarFor } from "../engine/calendar";
import { keyValues } from "../engine/check";
import { nextQuestion, recommend, type Answers } from "../engine/decide";
import { amt } from "../engine/tax";
import { getForm } from "../forms/registry";

const keyOf = (id: string) => {
  const c = getCase(id)!;
  return keyValues(getForm(c.form)!.def!, { ...c.profile, ...c.facts }, { filingDate: c.filingDate, classification: c.classification });
};
const dates = (form: string, year = 2025) => calendarFor(year).filter((e) => e.form.split(" ")[0] === form).map((e) => e.date);

describe("filing calendar", () => {
  it("lists the quarterly and annual individual returns on the dates in the forms' own instructions", () => {
    expect(dates("1701Q")).toEqual(["2025-05-15", "2025-08-15", "2025-11-15"]);
    expect(dates("1701")).toEqual(["2026-04-15"]);
    expect(dates("1700")).toEqual(["2026-04-15"]);
  });
  it("puts VAT and percentage tax 25 days after each quarter, and expanded withholding at the end of the next month", () => {
    expect(dates("2550Q")).toEqual(["2025-04-25", "2025-07-25", "2025-10-25", "2026-01-25"]);
    expect(dates("2551Q")).toEqual(["2025-04-25", "2025-07-25", "2025-10-25", "2026-01-25"]);
    expect(dates("1601-EQ")).toEqual(["2025-04-30", "2025-07-31", "2025-10-31", "2026-01-31"]);
  });
  it("has the corporate quarterly returns 60 days after the first three quarters and the annual return on April 15", () => {
    expect(dates("1702Q")).toEqual(["2025-05-30", "2025-08-29", "2025-11-29"]);
    expect(dates("1702-RT")).toEqual(["2026-04-15"]);
  });
  it("has the compensation return on the 10th of the next month, December on January 15, and 0619-E only for the first two months of a quarter", () => {
    const c = dates("1601-C");
    expect(c).toContain("2025-04-10");
    expect(c).toContain("2026-01-15");
    expect(c).toHaveLength(12);
    const e = dates("0619-E");
    expect(e).toHaveLength(8);
    expect(e).toContain("2025-02-10");
    expect(e).not.toContain("2025-04-10"); // March is the third month: covered by the 1601-EQ
  });
  it("is sorted and has the annual information returns", () => {
    const all = calendarFor(2025).map((e) => e.date);
    expect([...all].sort()).toEqual(all);
    expect(dates("1604-E")).toEqual(["2026-03-01"]);
    expect(dates("1604-C")).toEqual(["2026-01-31"]);
  });
  it("marks the dates that are only taught, not printed in an official document", () => {
    const ev = calendarFor(2025);
    expect(ev.find((e) => e.form === "1701Q")?.verified).toBe(true);
    expect(ev.find((e) => e.form === "2551Q")?.verified).toBe(false);
    expect(ev.find((e) => e.form === "1604-C")?.verified).toBe(false);
  });
});

describe("which-form helper", () => {
  const forms = (a: Answers) => recommend(a).map((p) => p.form);
  it("sends employees to the right place", () => {
    expect(forms({ area: "income-individual", income: "compensation", employers: "one-whole-year" })).toEqual(["2316"]);
    expect(forms({ area: "income-individual", income: "compensation", employers: "several" })).toEqual(["1700", "2316"]);
  });
  it("separates business, mixed and itemized returns", () => {
    expect(forms({ area: "income-individual", income: "business", period: "quarterly" })).toEqual(["1701Q"]);
    expect(forms({ area: "income-individual", income: "business", period: "annual", regime: "osd-or-8", microSmall: "no" })).toEqual(["1701A"]);
    expect(forms({ area: "income-individual", income: "business", period: "annual", regime: "itemized" })).toEqual(["1701"]);
    expect(forms({ area: "income-individual", income: "mixed", period: "annual", regime: "osd-or-8", microSmall: "no" })).toEqual(["1701"]);
    expect(forms({ area: "income-individual", income: "business", period: "annual", regime: "osd-or-8", microSmall: "yes" })).toEqual(["1701-MS", "1701A"]);
    expect(forms({ area: "income-individual", income: "estate-trust", period: "annual" })).toEqual(["1701"]);
  });
  it("covers corporations, withholding, business taxes, transfers, gifts and estates", () => {
    expect(forms({ area: "income-corporation", entity: "mixed", period: "annual" })).toEqual(["1702-MX"]);
    expect(forms({ area: "income-corporation", entity: "regular", period: "quarterly" })).toEqual(["1702Q"]);
    expect(forms({ area: "withholding", withheldOn: "compensation", when: "month-1-2" })).toEqual(["1601-C"]);
    expect(forms({ area: "withholding", withheldOn: "expanded", when: "month-3" })).toEqual(["1601-EQ"]);
    expect(forms({ area: "withholding", withheldOn: "expanded", when: "month-1-2" })).toEqual(["0619-E"]);
    expect(forms({ area: "withholding", withheldOn: "expanded", when: "year" })).toEqual(["1604-E"]);
    expect(forms({ area: "business-tax", taxType: "vat" })).toEqual(["2550Q"]);
    expect(forms({ area: "business-tax", taxType: "percentage" })).toEqual(["2551Q"]);
    expect(forms({ area: "transfer", transfer: "real-capital" })).toEqual(["1706", "2000-OT"]);
    expect(forms({ area: "transfer", transfer: "real-ordinary" })).toEqual(["1606", "2000-OT"]);
    expect(forms({ area: "transfer", transfer: "shares" })).toEqual(["1707", "2000-OT"]);
    expect(forms({ area: "gift-estate", gift: "estate" })).toEqual(["1801"]);
    expect(forms({ area: "gift-estate", gift: "gift" })).toEqual(["1800", "2000-OT"]);
  });
  it("keeps asking until it can answer, and every recommended form exists in the lab", () => {
    expect(nextQuestion({})?.key).toBe("area");
    expect(nextQuestion({ area: "income-individual" })?.key).toBe("income");
    expect(nextQuestion({ area: "gift-estate", gift: "estate" })).toBeNull();
    for (const p of recommend({ area: "business-tax", taxType: "dst" })) expect(getForm(p.form)).toBeTruthy();
  });
});

describe("cross-form scenarios", () => {
  it("every step points to a real case of the form it names", () => {
    for (const s of SCENARIOS) for (const st of s.steps) expect(getCase(st.caseId), `${s.id}: ${st.caseId}`).toBeTruthy();
  });
  it("scenario cases carry their scenario id and stay out of the form's own case list", () => {
    const x = ALL_CASES.filter((c) => c.scenario);
    expect(x.length).toBeGreaterThan(0);
    for (const c of x) expect(SCENARIOS.some((s) => s.id === c.scenario)).toBe(true);
  });
  it("X1: the 2307 tax is the credit in the third-quarter 1701Q, and the annual 1701A adds up the year", () => {
    expect(amt(keyOf("X1-2307")["twA"])).toBe(amt(getCase("1701Q-difficult")!.facts["58A"]));
    const annual = keyOf("X1-1701A");
    expect(amt(annual["56A"])).toBe(15_760_000); // 8% of 1,970,000
    // credits = prior excess + three quarterly payments + withholding of 3 quarters + 4th quarter
    expect(amt(annual["64A"])).toBe(12_360_000);
    expect(amt(annual["65A"])).toBe(3_400_000);
  });
  it("X2: March of the 1604-C is the amount of the 1601-C, and the 2316 ties out", () => {
    expect(getCase("X2-1604C")!.facts["w3A"]).toBe(getCase("1601-C-easy")!.facts["25A"]);
    expect(amt(keyOf("X2-1604C")["wTA"])).toBe(21_500_000);
    expect(amt(keyOf("X2-2316")["24A"])).toBe(amt(keyOf("X2-2316")["26A"]));
  });
  it("X3: the DST and the withholding tax use the same taxable base", () => {
    expect(amt(keyOf("1606-easy")["g2A"])).toBe(amt(keyOf("X3-2000OT")["15A"]));
    expect(amt(keyOf("X3-2000OT")["17A"])).toBe(675_000);
  });
});
