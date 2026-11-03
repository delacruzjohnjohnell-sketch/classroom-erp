// Cross-form scenarios: one story that needs several returns, with the numbers carried from one form to the next. The first and middle steps reuse cases that already exist;
// the cases below complete each chain. They carry `scenario` so the form lessons do not list them as their own case problems.
import type { CaseDef } from "./types";

export interface ScenarioStep { caseId: string; note: string }
export interface Scenario { id: string; title: string; intro: string; steps: ScenarioStep[] }

export const SCENARIOS: Scenario[] = [
  {
    id: "X1",
    title: "A professional's year: from the creditable-tax certificate to the annual return",
    intro: "Atty. Benjamin T. Rivera (Gapan City) practices law on the 8% income tax rate. A client withholds tax on his fees, which gives him a Form 2307 (step 1). That certificate is a credit in his third-quarter 1701Q (step 2), and the year's payments and certificates are added up in the annual return 1701A (step 3). Carry the numbers from each step to the next.",
    steps: [
      { caseId: "X1-2307", note: "The payor issues the certificate for July to September. The tax withheld is ₱9,000." },
      { caseId: "1701Q-difficult", note: "Use the ₱9,000 from the 2307 in Item 58. This quarter's return is filed late." },
      { caseId: "X1-1701A", note: "The year: the three quarterly payments, the credits, the fourth-quarter 2307 and the 8% tax on the full year's receipts." },
    ],
  },
  {
    id: "X2",
    title: "An employer's year: from the monthly return to the employee's certificate",
    intro: "Cabanatuan Learning Center, Inc. withholds tax on its employees' compensation. It remits every month with the 1601-C (step 1), summarizes the twelve months in the annual information return 1604-C (step 2), and gives each employee a certificate of compensation and tax withheld, the Form 2316 (step 3).",
    steps: [
      { caseId: "1601-C-easy", note: "The March 2025 remittance: ₱18,500 of tax withheld." },
      { caseId: "X2-1604C", note: "The twelve months; March must agree with the 1601-C you just filed." },
      { caseId: "X2-2316", note: "One employee's certificate: compensation, exempt items, tax due and tax withheld." },
    ],
  },
  {
    id: "X3",
    title: "One sale of real property, two obligations",
    intro: "Rosario Homes Development Corp., a habitual real-estate seller, sells a subdivision lot (an ordinary asset) to a buyer. The buyer must withhold and remit the withholding tax on the sale (the 1606, step 1) and declare the documentary stamp tax on the deed (the 2000-OT, step 2). Both use the same price and the same fair market value.",
    steps: [
      { caseId: "1606-easy", note: "The withholding tax is 1.5% of the taxable base, the higher of the price and the fair market value." },
      { caseId: "X3-2000OT", note: "The documentary stamp tax is ₱15 for each ₱1,000 of the same taxable base." },
    ],
  },
];

export const SCENARIO_CASES: CaseDef[] = [
  {
    id: "X1-2307", scenario: "X1", form: "2307", level: "easy", year: 2025, title: "Scenario 1, step 1: the fees certificate",
    story: ["Gapan Grains & Feeds, Inc. (Gapan City) paid Atty. Benjamin T. Rivera, an individual lawyer whose gross income for the year will not exceed ₱3,000,000, professional fees of ₱60,000 in July, ₱60,000 in August and ₱60,000 in September 2025. Choose the ATC, compute the tax withheld, and issue the Form 2307 (due 20 days after September 30)."],
    profile: { "2": "000-000-203-00000", "3": "RIVERA, BENJAMIN, TOLENTINO", "4": "BRGY. BURGOS, GAPAN CITY, NUEVA ECIJA", "4A": "3105", "6": "000-555-666-00000", "7": "GAPAN GRAINS & FEEDS, INC.", "8": "NATIONAL HIGHWAY, GAPAN CITY, NUEVA ECIJA", "8A": "3105" },
    facts: { "1": "07/01/2025", "1B": "09/30/2025", atc: "WI010", i1A: "60000", i2A: "60000", i3A: "60000" },
    filingDate: "2025-10-18", correctForm: "2307", whyForm: "The payor certifies the creditable tax withheld from the fees with Form 2307.",
    hints: ["Individual professional, gross income not above ₱3M: WI010 at 5%.", "Total the three months first."],
    solution: ["Total payments = ₱180,000. Tax withheld = 5% × ₱180,000 = ₱9,000. This is the amount Atty. Rivera credits in Item 58 of his third-quarter 1701Q."],
  },
  {
    id: "X1-1701A", scenario: "X1", form: "1701A", level: "average", year: 2025, title: "Scenario 1, step 3: the annual return",
    story: ["Atty. Rivera's 2025: professional fees ₱2,200,000 for the year (₱1,700,000 through September and ₱500,000 in the fourth quarter) and ₱20,000 commission (other non-operating income, described COMMISSION INCOME). He is on the 8% rate (ATC II017).",
      "Credits: ₱5,000 excess credit from 2024; the tax he paid with the first three quarterly returns: ₱12,000 (first quarter), ₱48,000 (second quarter) and ₱35,600 (third quarter, the tax part only, not the penalties) = ₱95,600; creditable tax withheld in the first three quarters: ₱8,000 (first two) + ₱9,000 (third, step 1) = ₱17,000; and ₱6,000 per the 2307s of the fourth quarter.",
      "He files and pays on April 14, 2026. Fill in BIR Form 1701A for 2025."],
    profile: { "4": "000-000-203-00000", "5": "026", "8": "RIVERA, BENJAMIN, TOLENTINO", "9": "BRGY. BURGOS, GAPAN CITY, NUEVA ECIJA", "9A": "3105", "10": "10/05/1980", "11": "benjamin.rivera@example.com", "12": "FILIPINO", "15": "09170000203", "16": "single" },
    facts: { "1": "12/2025", "2": "no", "3": "no", "6": "professional", "7": "II017", "13": "no", "19": "eight", "47A": "2200000", "50A": "20000", "50S": "COMMISSION INCOME", "57A": "5000", "58A": "95600", "59A": "17000", "60A": "6000", "31": "3" },
    filingDate: "2026-04-14", classification: "micro", correctForm: "1701A", whyForm: "A professional on the 8% rate with no compensation income files the annual return 1701A.",
    hints: ["The ₱250,000 reduction applies to a purely self-employed individual.", "Quarterly payments go to Item 58; the 2307s of the first three quarters to Item 59 and of the fourth quarter to Item 60.", "Prior year's excess credit goes to Item 57."],
    solution: ["Net receipts (Item 49) = ₱2,200,000; other income (Item 52) = ₱20,000; total (Item 53) = ₱2,220,000, under the ₱3,000,000 ceiling. Less ₱250,000: taxable income (Item 55) = ₱1,970,000.", "Tax due (Item 56) = 8% × ₱1,970,000 = ₱157,600.", "Credits (Item 64) = ₱5,000 + ₱95,600 + ₱17,000 + ₱6,000 = ₱123,600. Net tax payable (Item 65) = ₱34,000. Filed on time."],
  },
  {
    id: "X2-1604C", scenario: "X2", form: "1604-C", level: "average", year: 2025, title: "Scenario 2, step 2: the annual information return",
    story: ["Cabanatuan Learning Center, Inc. (private employer, Cabanatuan City) withheld on compensation: January ₱17,000; February ₱17,500; March ₱18,500 (the 1601-C of step 1); and ₱18,000 each month from April to December. No adjustments or penalties; no overremittance.", "Prepare the 1604-C for 2025 with one attachment (the alphalist)."],
    profile: { "4": "000-181-555-00000", "5": "025", "6": "CABANATUAN LEARNING CENTER, INC.", "7": "BRGY. SANGITAN, CABANATUAN CITY, NUEVA ECIJA", "7A": "3100", "9": "09170000181", "10": "hr181@example.com" },
    facts: { "1": "2025", "2": "no", "3": "1", "8": "private", "8A": "no", "11": "no", w1A: "17000", w2A: "17500", w3A: "18500", w4A: "18000", w5A: "18000", w6A: "18000", w7A: "18000", w8A: "18000", w9A: "18000", w10A: "18000", w11A: "18000", w12A: "18000" },
    filingDate: "2026-01-22", correctForm: "1604-C", whyForm: "An employer reports the year's compensation tax withheld with the annual information return 1604-C.",
    hints: ["March must equal the 1601-C you filed in step 1.", "April to December are nine months of ₱18,000."],
    solution: ["Total taxes withheld = ₱17,000 + ₱17,500 + ₱18,500 + 9 × ₱18,000 = ₱53,000 + ₱162,000 = ₱215,000. No adjustment or penalties: total remitted ₱215,000."],
  },
  {
    id: "X2-2316", scenario: "X2", form: "2316", level: "average", year: 2025, title: "Scenario 2, step 3: an employee's certificate",
    story: ["Prepare the Form 2316 for Josefina A. Villar (Barangay Mayapyap, Cabanatuan City 3100), a clerk of Cabanatuan Learning Center, Inc. for all of 2025. Basic salary ₱420,000. 13th month pay ₱35,000 and de minimis benefits ₱5,000 (exempt), and employee contributions ₱28,000. Tax withheld ₱26,500.", "This certificate is one of the many that the employer's 1604-C (step 2) covers."],
    profile: { "3": "000-000-902-00000", "5": "025", "4": "VILLAR, JOSEFINA, ANGELES", "6": "BRGY. MAYAPYAP, CABANATUAN CITY, NUEVA ECIJA", "6A": "3100", "7": "08/14/1992", "8": "09170000902", "11": "main", "12": "000-181-555-00000", "13": "CABANATUAN LEARNING CENTER, INC.", "14": "BRGY. SANGITAN, CABANATUAN CITY, NUEVA ECIJA", "14A": "3100" },
    facts: { "1": "2025", "2": "0101 TO 1231", "39A": "420000", "34A": "35000", "35A": "5000", "36A": "28000", "25AA": "26500" },
    filingDate: "2026-01-26", correctForm: "2316", whyForm: "The employer certifies compensation and tax withheld to the employee with Form 2316.",
    hints: ["Exempt items add up in Item 38; taxable in Item 52.", "Item 24 uses the annual table on Item 23."],
    solution: ["Non-taxable (Item 38) = ₱68,000. Taxable (Item 52) = ₱420,000. Tax due (Item 24) = ₱22,500 + 20% × ₱20,000 = ₱26,500 = tax withheld (Item 26)."],
  },
  {
    id: "X3-2000OT", scenario: "X3", form: "2000-OT", level: "easy", year: 2025, title: "Scenario 3, step 2: the documentary stamp tax",
    story: ["Eduardo T. Navarro (Barangay Mabini, Cabanatuan City), the buyer in step 1, also declares the documentary stamp tax on the deed of sale of the lot he bought from Rosario Homes Development Corp. on March 12, 2025 (price ₱450,000; tax declaration ₱300,000; BIR zonal value ₱400,000). The property is an ordinary asset of the seller, located in Cabanatuan City.", "He files on April 4, 2025 (due April 5). Fill in BIR Form 2000-OT."],
    profile: { "5": "000-211-888-00000", "6": "025", "7": "NAVARRO, EDUARDO, TAN", "8": "BRGY. MABINI, CABANATUAN CITY, NUEVA ECIJA", "8A": "3100", "9": "09170000211", "10": "ot211@example.com", "11": "seller", "11A": "ROSARIO HOMES DEVELOPMENT CORP.", "11B": "000-211-999-00000" },
    facts: { "1": "03/12/2025", "2": "no", "3": "DO122", "4": "1", "12": "ordinary", "13": "BRGY. SAN ISIDRO, CABANATUAN CITY, NUEVA ECIJA", g1A: "450000", g2A: "400000" },
    filingDate: "2025-04-04", classification: "large", correctForm: "2000-OT", whyForm: "The documentary stamp tax on a one-time sale of real property is declared with Form 2000-OT.",
    hints: ["The base is the same as the 1606 taxable base: the higher of price and FMV.", "₱15 for each ₱1,000 or fraction."],
    solution: ["Taxable base = higher of ₱450,000 and ₱400,000 = ₱450,000. DST = 450 × ₱15 = ₱6,750. On time: total payable ₱6,750."],
  },
];
