// Every rate, threshold and date the BIR Lab uses, in one place. Forms, answer keys and lectures read ONLY from here.
// Each entry carries the date it takes effect, its legal basis, and whether it was checked against an official document (`verified`).
// When the law changes, change this file; nothing else holds a rate.

export interface Bracket { over: number; base: number; rate: number }

export interface RuleMeta {
  effectiveFrom: string;
  basis: string;
  /** True only when the figure was read from an official BIR document (a form, RR or RMC) and matches it. */
  verified: boolean;
  note?: string;
}

/** The individual income tax table (pesos). */
export interface BracketTable extends RuleMeta { brackets: Bracket[] }

export const RULES = {
  asOf: "2026-11-03",

  /** Table 2 printed on BIR Form 1701A (Jan 2018): taxable years 2023 onwards. */
  individualTable2023: {
    effectiveFrom: "2023-01-01",
    basis: "NIRC Sec. 24(A) as amended by RA 10963 (TRAIN); Table 2 on BIR Form 1701A (January 2018, with rates); RMC 122-2023",
    verified: true,
    brackets: [
      { over: 0, base: 0, rate: 0 },
      { over: 250_000, base: 0, rate: 0.15 },
      { over: 400_000, base: 22_500, rate: 0.20 },
      { over: 800_000, base: 102_500, rate: 0.25 },
      { over: 2_000_000, base: 402_500, rate: 0.30 },
      { over: 8_000_000, base: 2_202_500, rate: 0.35 },
    ],
  } satisfies BracketTable,

  /** Table 1 printed on the same form: taxable years 2018 to 2022. Kept so a case can test "wrong year's rates". */
  individualTable2018: {
    effectiveFrom: "2018-01-01",
    basis: "NIRC Sec. 24(A) as amended by RA 10963 (TRAIN); Table 1 on BIR Form 1701A (January 2018, with rates)",
    verified: true,
    brackets: [
      { over: 0, base: 0, rate: 0 },
      { over: 250_000, base: 0, rate: 0.20 },
      { over: 400_000, base: 30_000, rate: 0.25 },
      { over: 800_000, base: 130_000, rate: 0.30 },
      { over: 2_000_000, base: 490_000, rate: 0.32 },
      { over: 8_000_000, base: 2_410_000, rate: 0.35 },
    ],
  } satisfies BracketTable,

  eightPercent: {
    effectiveFrom: "2018-01-01",
    basis: "NIRC Sec. 24(A)(2)(b)-(c); printed on BIR Form 1701A items 19 and 47 to 56",
    verified: true,
    rate: 0.08,
    /** Item 54: allowable reduction for PURELY self-employed individuals and/or professionals. */
    reduction: 250_000,
    /** "Available if gross sales/receipts and other non-operating income do not exceed P3M" (item 19). */
    ceiling: 3_000_000,
    note: "Which figure the P3M test uses (before or after returns and discounts) is not spelled out on the form. The lab tests item 53 (net sales plus other non-operating income).",
  },

  osd: {
    effectiveFrom: "2018-01-01",
    basis: "NIRC Sec. 34(L); BIR Form 1701A item 39",
    verified: true,
    rate: 0.40,
    note: "The form applies 40% to item 38 (net sales/revenues/receipts/fees), not to gross before returns. Your spec says 'gross sales/receipts'; the lab follows the form.",
  },

  /** Annual income tax return of an individual: 15th day of April following the close of the taxable year. */
  annualIndividualDue: {
    effectiveFrom: "1998-01-01",
    basis: "NIRC Sec. 51(B)",
    verified: false,
    month: 4,
    day: 15,
    note: "The 1701A PDF on bir.gov.ph has no Guidelines and Instructions page, so this date comes from the Code and the form's 'Item 23: on or before October 15' text, not from the form's own instructions.",
  },

  /** Item 23: second installment. */
  installment: {
    effectiveFrom: "1998-01-01",
    basis: "NIRC Sec. 56(A)(2); BIR Form 1701A item 23",
    verified: false,
    maxShareOfTaxDue: 0.5,
    secondDueMonth: 10,
    secondDueDay: 15,
    minTaxDue: 2_000,
    note: "The 50% limit and October 15 are printed on the form. The P2,000 minimum is from the Code and was not checked against an instruction page.",
  },

  /** Taxpayer classification by gross sales/receipts. */
  classification: {
    effectiveFrom: "2024-01-01",
    basis: "RA 11976 (EOPT); RR 8-2024",
    verified: false,
    microBelow: 3_000_000,
    smallBelow: 20_000_000,
    mediumBelow: 1_000_000_000,
  },

  penalties: {
    general: { effectiveFrom: "1998-01-01", basis: "NIRC Secs. 248-249", verified: false, surcharge: 0.25, willfulSurcharge: 0.5, interest: 0.12 },
    microSmall: { effectiveFrom: "2024-01-01", basis: "RA 11976 (EOPT) amending Secs. 248-249", verified: false, surcharge: 0.10, interest: 0.06, compromiseReduction: 0.5 },
    note: "The compromise penalty schedule is not coded: cases state the compromise amount, and the form item (27) is typed by the student.",
  },

  /** Tax types a 1701A filer can have: ATC printed on the form (items 7 and 69). */
  atc: {
    II012: { label: "Business Income - Graduated IT Rates", type: "single", rate: "graduated" },
    II014: { label: "Income from Profession - Graduated IT Rates", type: "professional", rate: "graduated" },
    II015: { label: "Business Income - 8% IT Rate", type: "single", rate: "eight" },
    II017: { label: "Income from Profession - 8% IT Rate", type: "professional", rate: "eight" },
  } as const,
};

export type AtcCode = keyof typeof RULES.atc;

/** Every rule that was not checked against an official document, for the phase report. */
export function unverifiedRules(): { rule: string; basis: string; note?: string }[] {
  const out: { rule: string; basis: string; note?: string }[] = [];
  const walk = (name: string, v: unknown) => {
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.basis === "string" && o.verified === false) out.push({ rule: name, basis: o.basis, note: typeof o.note === "string" ? o.note : undefined });
      else if (!("basis" in o)) for (const [k, x] of Object.entries(o)) walk(`${name}.${k}`, x);
    }
  };
  for (const [k, v] of Object.entries(RULES)) if (k !== "asOf") walk(k, v);
  return out;
}
