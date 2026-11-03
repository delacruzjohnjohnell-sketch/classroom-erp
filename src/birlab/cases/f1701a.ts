// Case problems for BIR Form 1701A. Every person, TIN, address and business is fictional (TINs are 000- placeholders; addresses are in Nueva Ecija).
// A case holds the STORY and the FACTS the student must put on the form. The answer key is not stored here: it is the form's own computation run on the facts
// (engine/check.ts keyValues), and birlab.test.ts proves each key's numbers by hand.
import type { CaseDef } from "./types";
export type { CaseDef, Level } from "./types";

export const CASES_1701A: CaseDef[] = [
  {
    id: "1701A-easy",
    form: "1701A",
    level: "easy",
    year: 2025,
    title: "Aling Rosario's sari-sari store",
    story: [
      "Rosario M. Bautista, 47, single, runs a sari-sari store at Barangay Sumacab Este, Cabanatuan City, Nueva Ecija 3100. She is registered as a single proprietor, has no employees and earns nothing else.",
      "For 2025 her total sales were ₱520,000, with no returns or discounts. She had no other income, no creditable tax withheld by anyone, and made no quarterly income tax payment because her quarterly returns showed no tax due. She did not opt for the 8% rate, so she is under the graduated rates with the optional standard deduction (OSD).",
      "She files her annual return on April 10, 2026, together with the full payment. Fill in BIR Form 1701A for the taxable year 2025.",
    ],
    profile: { "4": "000-000-001-00000", "5": "025", "8": "BAUTISTA, ROSARIO, MENDOZA", "9": "BRGY. SUMACAB ESTE, CABANATUAN CITY, NUEVA ECIJA", "9A": "3100", "10": "03/14/1978", "11": "rosario.bautista@example.com", "12": "FILIPINO", "15": "09170000001", "16": "single" },
    facts: { "1": "12/2025", "2": "no", "3": "no", "6": "single", "7": "II012", "13": "no", "19": "graduated", "36A": "520000", "37A": "0", "31": "0" },
    filingDate: "2026-04-10",
    correctForm: "1701A",
    whyForm: "She earns income purely from business and uses the graduated rates with OSD, so the return is BIR Form 1701A.",
    hints: ["Which tax rate did she choose? That decides whether you fill Part IV.A or IV.B.", "OSD is 40% of Item 38. Subtract it to get the net income (Item 40).", "Apply the graduated table for 2023 onwards (Table 2) to the taxable income. The first ₱250,000 is at 0%."],
    solution: [
      "Net sales (Item 38) = ₱520,000 − ₱0 = ₱520,000.",
      "OSD (Item 39) = 40% × ₱520,000 = ₱208,000.",
      "Net income (Item 40) = ₱520,000 − ₱208,000 = ₱312,000; no other income, so taxable income (Item 45) = ₱312,000.",
      "Tax due (Item 46), Table 2: 15% × (₱312,000 − ₱250,000) = ₱9,300.",
      "No credits, so Item 65 = ₱9,300. Filed on time: no penalties. Total amount payable (Item 29) = ₱9,300.",
    ],
  },
  {
    id: "1701A-average",
    form: "1701A",
    level: "average",
    year: 2025,
    title: "Dr. Aquino's dental clinic, 8% option",
    story: [
      "Dr. Jose P. Aquino, 39, single, is a dentist in San Jose City, Nueva Ecija 3121. He practices alone and has no other job. At the start of 2025 he chose the 8% income tax rate in his first quarterly return.",
      "For 2025: professional fees collected ₱1,850,000, less ₱50,000 of refunds and discounts to patients. He also earned ₱25,000 commission from a dental supplier (not subject to final tax).",
      "He paid ₱90,000 in income tax with his first three quarterly returns, was withheld ₱12,000 by clinics he serves for the first three quarters, and received a Form 2307 for ₱4,500 withheld in the fourth quarter. He has no excess credit from 2024. He attaches three papers: the 2307s and the quarterly payment proofs.",
      "He files and pays in full on April 14, 2026. Fill in BIR Form 1701A for 2025.",
    ],
    profile: { "4": "000-000-002-00000", "5": "025", "8": "AQUINO, JOSE, PASCUAL", "9": "PUROK 4, BRGY. ABAR 1ST, SAN JOSE CITY, NUEVA ECIJA", "9A": "3121", "10": "08/02/1986", "11": "jose.aquino@example.com", "12": "FILIPINO", "15": "09170000002", "16": "single" },
    facts: { "1": "12/2025", "2": "no", "3": "no", "6": "professional", "7": "II017", "13": "no", "19": "eight", "47A": "1850000", "48A": "50000", "50A": "25000", "50S": "COMMISSION INCOME", "58A": "90000", "59A": "12000", "60A": "4500", "31": "3" },
    filingDate: "2026-04-14",
    correctForm: "1701A",
    whyForm: "He earns purely from a profession and chose the 8% rate, so he files 1701A. He is not a mixed-income earner (no compensation) and does not use itemized deductions.",
    hints: ["Which ATC goes with a professional on the 8% rate?", "The 8% rate is on gross receipts net of returns and discounts, plus other non-operating income, less ₱250,000.", "The credits go to items 58 (quarterly payments), 59 and 60 (creditable tax withheld). Do not put them all in one line."],
    solution: [
      "Taxpayer is a professional on the 8% rate: ATC II017 (Item 7), tax rate 8% (Item 19).",
      "Net receipts (Item 49) = ₱1,850,000 − ₱50,000 = ₱1,800,000. Other non-operating income (Item 52) = ₱25,000.",
      "Total taxable income (Item 53) = ₱1,825,000; this is under the ₱3,000,000 ceiling, so the 8% rate is allowed.",
      "Less the ₱250,000 reduction (Item 54): taxable income (Item 55) = ₱1,575,000. Tax due (Item 56) = 8% × ₱1,575,000 = ₱126,000.",
      "Credits (Item 64) = ₱90,000 + ₱12,000 + ₱4,500 = ₱106,500. Net tax payable (Item 65) = ₱126,000 − ₱106,500 = ₱19,500.",
      "Filed on time, no installment: Item 24 = Item 29 = ₱19,500.",
    ],
  },
  {
    id: "1701A-difficult",
    form: "1701A",
    level: "difficult",
    year: 2025,
    title: "Mang Pedro's hardware: late, with penalties",
    story: [
      "Pedro L. Villanueva, 52, single, owns a hardware store in Gapan City, Nueva Ecija 3105. He is a single proprietor under the graduated rates with OSD (he never opted for 8%).",
      "For 2025: sales ₱2,400,000, less ₱100,000 returns and discounts. He also sold scrap materials for ₱20,000 (other non-operating income). His bank savings interest and a dividend from a domestic corporation were already taxed at the source by final tax, so they do not belong on this return.",
      "Credits: ₱10,000 excess credit carried over from 2024; ₱120,000 paid with his first three quarterly returns; ₱18,000 creditable tax withheld in the first three quarters; and a Form 2307 for ₱6,000 for the fourth quarter.",
      "Mang Pedro forgot the deadline. He files and pays on June 30, 2026. As a micro taxpayer (sales under ₱3 million), the late-filing surcharge is 10% and interest is 6% a year, counted by the day over 365. The RDO assessed a compromise penalty of ₱5,000 (enter it as given). Fill in BIR Form 1701A for 2025, with the penalties.",
    ],
    profile: { "4": "000-000-003-00000", "5": "025", "8": "VILLANUEVA, PEDRO, LAZARO", "9": "BRGY. MABUHAY, GAPAN CITY, NUEVA ECIJA", "9A": "3105", "10": "11/21/1973", "11": "pedro.villanueva@example.com", "12": "FILIPINO", "15": "09170000003", "16": "single" },
    facts: { "1": "12/2025", "2": "no", "3": "no", "6": "single", "7": "II012", "13": "no", "19": "graduated", "36A": "2400000", "37A": "100000", "41A": "20000", "41S": "SALE OF SCRAP MATERIALS", "57A": "10000", "58A": "120000", "59A": "18000", "60A": "6000", "27A": "5000", "31": "4" },
    filingDate: "2026-06-30",
    correctForm: "1701A",
    whyForm: "Purely business income under the graduated rates with OSD: 1701A. Late filing does not change the form; it adds penalties to Part II.",
    hints: ["Interest and dividends taxed by final tax are NOT part of the taxable income on this return.", "The return was due April 15, 2026. Count the days to June 30, 2026.", "Surcharge and interest are computed on the amount of tax payable (Item 24). Use the micro-taxpayer rates the story gives."],
    solution: [
      "Net sales (Item 38) = ₱2,400,000 − ₱100,000 = ₱2,300,000. OSD (Item 39) = 40% × ₱2,300,000 = ₱920,000. Net income (Item 40) = ₱1,380,000.",
      "Other income (Item 41) = ₱20,000 scrap sales only; the final-taxed interest and dividend are left out. Taxable income (Item 45) = ₱1,400,000.",
      "Tax due (Item 46), Table 2: ₱102,500 + 25% × (₱1,400,000 − ₱800,000) = ₱252,500.",
      "Credits (Item 64) = ₱10,000 + ₱120,000 + ₱18,000 + ₱6,000 = ₱154,000. Net tax payable (Items 65, 22, 24) = ₱252,500 − ₱154,000 = ₱98,500.",
      "Due April 15, 2026; filed June 30, 2026 = 76 days late. Surcharge (Item 25) = 10% × ₱98,500 = ₱9,850.",
      "Interest (Item 26) = ₱98,500 × 6% × 76 ÷ 365 = ₱1,230.58, rounded to ₱1,231. Compromise (Item 27) = ₱5,000 as given.",
      "Total penalties (Item 28) = ₱9,850 + ₱1,231 + ₱5,000 = ₱16,081. Total amount payable (Item 29) = ₱98,500 + ₱16,081 = ₱114,581.",
    ],
  },
];

export const getCase = (id: string): CaseDef | undefined => CASES_1701A.find((c) => c.id === id);
