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
    verified: true,
    month: 4,
    day: 15,
    note: "Stated on the BIR forms pages for 1700 and 1701A ('on or before April 15 of each year covering income for the preceding taxable year'). The 1701A and 1700 PDFs have no instruction page, and RMC 20-2026 (calendar year 2025 filing guidelines) does not restate the date in its digest.",
  },

  /** Quarterly income tax return of individuals (1701Q): 1st quarter May 15, 2nd August 15, 3rd November 15 of the current taxable year. */
  quarterlyIndividualDue: {
    effectiveFrom: "2018-01-01",
    basis: "Guidelines and Instructions for BIR Form No. 1701Q [January 2018 (ENCS)], 'When and Where to File'; NIRC Sec. 74-75",
    verified: true,
    dates: { 1: "05-15", 2: "08-15", 3: "11-15" } as Record<number, string>,
    note: "The eFPS help page for 1701Q still says April 15 for the first quarter. The form's own Guidelines and Instructions say May 15, which the lab follows.",
  },

  /** Corporations: annual return due the 15th day of the 4th month after year-end; quarterly return within 60 days after each of the first three quarters. */
  corporateDue: {
    effectiveFrom: "1998-01-01",
    basis: "BIR forms page for 1702-RT/EX/MX (annual); Guidelines and Instructions for BIR Form 1702Q (60 days); NIRC Secs. 52 and 75",
    verified: true,
    annualMonthsAfterYearEnd: 4, annualDay: 15, quarterlyDays: 60,
  },

  /** Corporate income tax rates (domestic corporations) and the minimum corporate income tax printed on the corporate forms. */
  corporate: {
    effectiveFrom: "2020-07-01",
    basis: "NIRC Sec. 27(A) as amended by RA 11534 (CREATE): 25%, or 20% for a corporation with net taxable income of P5,000,000 or less and total assets (excluding land) of P100,000,000 or less; Sec. 27(E) MCIT",
    verified: false,
    regularRate: 0.25, reducedRate: 0.20, reducedNetTaxableCeiling: 5_000_000, reducedAssetsCeiling: 100_000_000,
    note: "The corporate forms print the rate as a typed box; the percentages and the P5M / P100M tests come from the Code, not from the form. The rate in the 1702 forms here is chosen by the student. The ATC table printed on the January 2018 form shows 30% for a domestic corporation (the pre-CREATE rate); the lab uses the CREATE rates.",
  },
  mcit: {
    effectiveFrom: "2023-07-01",
    basis: "Printed on BIR Forms 1702-RT, 1702-MX and 1702Q: MCIT is 2% of gross income; the higher of normal income tax and MCIT is the tax due",
    verified: true,
    rate: 0.02,
    note: "The rate was 1% from July 1, 2020 to June 30, 2023 under CREATE; the lab's cases are all for 2025.",
  },

  /** VAT, percentage tax, and the withholding / DST deadlines used by the Track B forms. */
  vat: {
    effectiveFrom: "2018-01-01",
    basis: "Guidelines and Instructions of BIR Form 2550Q (April 2024): VAT 12% of gross sales; the return is filed and the tax paid within twenty-five (25) days following the close of each taxable quarter",
    verified: true, rate: 0.12, dueDays: 25,
  },
  percentageTax: {
    effectiveFrom: "2023-07-01",
    basis: "ATC table printed on BIR Form 2551Q (January 2018 ENCS); NIRC Sec. 128 (return within 25 days after the end of each quarter)",
    verified: false,
    dueDays: 25,
    rates: { PT010: 0.03, PT040: 0.03, PT070: 0.03, PT130: 0.04, PT150: 0.18 } as Record<string, number>,
    labels: { PT010: "PT 010 Persons exempt from VAT under Sec. 109(BB) (Sec. 116) - 3%", PT040: "PT 040 Domestic carriers and keepers of garages (Sec. 117) - 3%", PT070: "PT 070 Franchises on radio/TV broadcasting companies, annual gross receipts not over P10M (Sec. 119) - 3%", PT130: "PT 130 Insurance agents - 4%", PT150: "PT 150 Amusement places (Sec. 125) - 18%" } as Record<string, string>,
    note: "The rates are as printed on the 2551Q ATC table. The 25-day deadline is not in the 2551Q PDF text; it is the Code (Sec. 128) and the user's table. The percentage tax on persons exempt from VAT was 1% from July 2020 to June 2023 (CREATE); the form prints 3%.",
  },
  withholdingDue: {
    effectiveFrom: "2018-01-01",
    basis: "Guidelines of BIR Forms 1601-C (10th day of the following month; December: January 15), 0619-E (10th day following the month), 1601-EQ (last day of the month following the close of the quarter)",
    verified: true,
    monthlyDay: 10, decemberCompensationDay: 15,
  },
  realPropertyWithholding: {
    effectiveFrom: "2018-01-01",
    basis: "Schedule 4 of BIR Form 1606 (January 2018 ENCS): exempt for socialized housing; 1.5% / 3% / 5% by selling price for a habitual real-estate seller; 6% for a seller not habitually engaged",
    verified: false,
    dueDayNextMonth: 10,
    note: "The rates are printed on the form. The deadline (10th day of the month after the transaction) is not in the 1606 PDF; the user's table says 'month after the transaction'.",
  },
  dst: {
    effectiveFrom: "2018-01-01",
    basis: "Documentary Stamp Tax ATC table printed on BIR Forms 2000 and 2000-OT (January 2018 ENCS)",
    verified: false,
    dueDay: 5,
    note: "The rates are printed on the forms (DS 101 P2.00/P200; DS 102 P1.50/P200; DS 106 P1.50/P200 of issue price; DS 120 first P2,000 P6 then P2/P1,000; DS 121 first P5,000 P40 then P20/P5,000; real property P15/P1,000). The deadline (5th day after the month) is the user's table and the Code; it is not printed on the PDFs.",
  },

  /** Capital gains tax on real property (6% of the higher of selling price and fair market value) and on unlisted shares (15% of net capital gain). */
  capitalGains: {
    effectiveFrom: "2018-01-01",
    basis: "Printed on BIR Form 1706 (6%) and Form 1707 (15%); NIRC Sec. 24(D), 27(D)(5); Guidelines of Form 1707: file and pay within thirty (30) days after each sale",
    verified: true,
    propertyRate: 0.06, shareRate: 0.15, dueDays: 30,
    note: "The 30 days is stated in the Guidelines of Form 1707 (April 2021). The 1706 PDF has no instruction page; the same 30 days comes from NIRC Sec. 24(D) and the user's table.",
  },

  /** Estate tax (BIR Form 1801): rate and deductions printed on the form; the one-year deadline is the Code and the user's table. */
  estateTax: {
    effectiveFrom: "2018-01-01",
    basis: "Printed on BIR Form 1801 (January 2018 ENCS): 6% on the net taxable estate; standard deduction P5,000,000 (citizen or resident) or P500,000 (non-resident alien); family home deduction up to P10,000,000 for a resident citizen; NIRC Sec. 86 and Sec. 90",
    verified: true,
    rate: 0.06, standardResident: 5_000_000, standardNonResident: 500_000, familyHomeCap: 10_000_000, dueMonthsAfterDeath: 12,
    note: "The rates and deductions are printed on the form. The 1801 PDF has no instruction page: the filing deadline of one year from death (Sec. 90) is from the Code and the user's table.",
  },
  /** Donor's tax (BIR Form 1800): the 1800 PDF could not be downloaded, so these come from the Code and a secondary description, not from the form. */
  donorTax: {
    effectiveFrom: "2018-01-01",
    basis: "NIRC Sec. 99 as amended by RA 10963 (TRAIN): 6% of total net gifts in excess of P250,000 within a calendar year; Sec. 103: return within 30 days after the gift (BIR Form 1800)",
    verified: false,
    rate: 0.06, annualExemption: 250_000, dueDays: 30,
    note: "No official BIR Form 1800 PDF could be downloaded (the January 2018 version is only in the eBIRForms package); the item labels of the lab's 1800 are descriptive, not the printed item numbers. Verify against the official form before class.",
  },

  /** Withholding: expanded (creditable) rates used by Form 2307, and the deadlines of the withholding certificates and annual information returns. */
  ewt: {
    effectiveFrom: "2018-01-01",
    basis: "RR 11-2018 (expanded withholding tax rates), as listed in the ATC table on page 2 of BIR Form 2307 (January 2018 ENCS)",
    verified: false,
    rates: { WI010: 0.05, WI011: 0.10, WC010: 0.05, WC011: 0.10, WC100: 0.05, WC158: 0.01, WC160: 0.02 } as Record<string, number>,
    labels: {
      WI010: "WI010 Professional (individual): gross income for the year did not exceed P3M - 5%",
      WI011: "WI011 Professional (individual): gross income more than P3M or VAT-registered - 10%",
      WC010: "WC010 Professional (non-individual): gross income did not exceed P720,000 - 5%",
      WC011: "WC011 Professional (non-individual): gross income exceeds P720,000 - 10%",
      WC100: "WC100 Rental of real property - 5%",
      WC158: "WC158 Payment by top withholding agent to a supplier of goods - 1%",
      WC160: "WC160 Payment by top withholding agent to a supplier of services - 2%",
    } as Record<string, string>,
    note: "The ATC table on page 2 of the 2307 PDF did not extract cleanly into a code-to-rate table, so these rates are from RR 11-2018 as remembered by the author and were not machine-checked against the PDF. Verify against the PDF before use in class.",
  },
  certificateDue: {
    effectiveFrom: "2018-01-01",
    basis: "RR 11-2018 (Form 2307 given to the payee within 20 days after the close of the quarter); Form 2316 given to the employee by January 31 (taught as Jan 31)",
    verified: false,
    form2307Days: 20, form2316Month: 1, form2316Day: 31,
  },
  informationReturnDue: {
    effectiveFrom: "2018-01-01",
    basis: "BIR Form 1604-E Guidelines (eFPS help page): on or before March 1 of the year following; 1604-C: January 31 (the user's table; not seen in a BIR document)",
    verified: false,
    form1604C: { month: 1, day: 31 }, form1604E: { month: 3, day: 1 },
    note: "RMC 18-2021: 1604-C, 1604-E and 1604-F are information returns and no payment is made; the failure-to-file penalty quoted for 1604-E is P1,000 per failure, P25,000 a year at most.",
  },

  /** Form 1700: second installment and the exempt portion of 13th month pay and other benefits. */
  compensation: {
    effectiveFrom: "2018-01-01",
    basis: "NIRC Sec. 32(B)(7)(e) as amended by RA 10963 (TRAIN): 13th month pay and other benefits exempt up to P90,000; Sec. 24(A)(2)(a); NIRC Sec. 25(B) (25% flat rate on non-resident aliens not engaged in trade or business)",
    verified: false,
    exemptBenefitsCeiling: 90_000,
    flatRateNranetb: 0.25,
    note: "The P90,000 ceiling and the 25% rate are from the Code. The 25% rate is printed on the form (Part V.B); the ceiling is not printed on it.",
  },

  /** Item 23: second installment. */
  installment: {
    effectiveFrom: "1998-01-01",
    basis: "NIRC Sec. 56(A)(2); BIR Form 1701A item 23",
    verified: true,
    maxShareOfTaxDue: 0.5,
    secondDueMonth: 10,
    secondDueDay: 15,
    minTaxDue: 2_000,
    note: "The 50% limit and October 15 are printed on the form; the P2,000 minimum is from the Guide of Form 1701-MS (August 2024): a tax due in excess of P2,000.",
  },

  /** Taxpayer classification by gross sales/receipts. */
  classification: {
    effectiveFrom: "2024-01-01",
    basis: "RA 11976 (EOPT); RR 8-2024",
    verified: false,
    note: "Micro (gross sales under P3,000,000) and small (P3,000,000 to under P20,000,000) are stated in the Guide of Form 1701-MS (August 2024). The medium ceiling is from RA 11976 and not checked against a BIR document.",
    microBelow: 3_000_000,
    smallBelow: 20_000_000,
    mediumBelow: 1_000_000_000,
  },

  penalties: {
    general: { effectiveFrom: "1998-01-01", basis: "NIRC Secs. 248-249; Guidelines and Instructions of BIR Form 2550Q (April 2024): 25% surcharge, interest at double the legal interest rate (12%)", verified: true, surcharge: 0.25, willfulSurcharge: 0.5, interest: 0.12 },
    microSmall: { effectiveFrom: "2024-01-01", basis: "RA 11976 (EOPT) amending Secs. 248-249; Guidelines and Instructions of BIR Form 2550Q (April 2024): 10% surcharge, interest at 50% of the Sec. 249 rate (legal interest 6%), compromise reduced by 50%", verified: true, surcharge: 0.10, interest: 0.06, compromiseReduction: 0.5 },
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
