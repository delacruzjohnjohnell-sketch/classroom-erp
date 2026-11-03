// BIR Form 1601-EQ, January 2019 (ENCS): Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded).
// Item numbers follow docs/bir-forms/1601-EQ-Jan-2019.pdf and its Guide: filed and paid not later than the last day of the month following the close of the quarter.
// Simplified: three ATC lines (Items 13 to 15) instead of six. Rates come from rules/2026.ts (ewt), flagged as not machine-checked against the PDF.
import { RULES } from "../rules/2026";
import { roundToPeso } from "../engine/tax";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { caseOf, lastDay, lessonOf, ymd } from "./kit";

const ATC = opts(...Object.entries(RULES.ewt.labels).map(([k, l]) => [k, l] as [string, string]));
const rate = (atc: string) => RULES.ewt.rates[atc] ?? 0;

/** Not later than the last day of the month following the close of the quarter. */
function dueOf(v: Values): string {
  const y = /^\d{4}$/.test(v["1"] ?? "") ? Number(v["1"]) : 0, q = Number(v["2"]);
  if (!y || !(q >= 1 && q <= 4)) return "";
  const endMonth = q * 3;
  const m = endMonth === 12 ? 1 : endMonth + 1, yy = endMonth === 12 ? y + 1 : y;
  return ymd(yy, m, lastDay(yy, m));
}
const line = (n: 13 | 14 | 15) => ({ id: String(n), item: String(n), label: `ATC line ${n - 12}: Taxable Amount (A) and Tax Withheld (B, at the ATC's rate)`, f: (c: { at: (id: string, col: "A" | "B") => number; text: (id: string) => string }) => roundToPeso(Math.round(c.at(String(n), "A") * rate(c.text(`atc${n}`)))), computedCols: ["B"] as ("A" | "B")[] });

export const DEF = makeForm({
  id: "1601-EQ", number: "1601-EQ", title: "Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)", subtitle: "Withholding agents: the quarter's expanded withholding and what was remitted",
  version: "January 2019 (ENCS)", versionNote: "Official PDF: 1601-EQ January 2019 ENCS final and its Guide. Due not later than the last day of the month following the close of the quarter (Guide).",
  yearId: "1", spouse: () => true, colLabels: ["A) Taxable amount", "B) Tax withheld / remittance"],
  identity: [
    fields(f("1", "1", "For the Year (YYYY)", "year", { span: 3, required: true }), f("2", "2", "Quarter", "radio", { span: 3, options: opts(["1", "1st"], ["2", "2nd"], ["3", "3rd"], ["4", "4th"]), required: true }), yes("3", "3", "Amended Return?", 3), yes("4", "4", "Any Taxes Withheld?", 3)),
    fields(f("5", "5", "Number of Sheet/s Attached", "count", { span: 3, required: true })),
    fields(f("6", "6", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("7", "7", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("8", "8", "Withholding Agent's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("9", "9", "Registered Address", "text", { span: 9, required: true }), f("9A", "9A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("10", "10", "Contact Number", "phone", { span: 4 }), f("11", "11", "Category of Withholding Agent", "radio", { span: 4, options: opts(["private", "Private"], ["government", "Government"]), required: true }), f("12", "12", "Email Address", "email", { span: 4 })),
    radio("atc13", "ATC 13", "Item 13: ATC of line 1", ATC),
    fields(f("atc14", "ATC 14", "Item 14: ATC of line 2 (optional)", "radio", { span: 12, options: ATC })),
    fields(f("atc15", "ATC 15", "Item 15: ATC of line 3 (optional)", "radio", { span: 12, options: ATC })),
  ],
  required: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "9A", "11", "atc13"].map((id) => ({ id, message: id === "atc13" ? "Choose the ATC of line 1 (Item 13)." : `Item ${id} is required.` })),
  formats: { tin: ["6"], rdo: ["7"], zip: ["9A"], email: ["12"] },
  sections: [
    { id: "p2", title: "Part II – Computation of Tax", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      line(13), line(14), line(15),
      { id: "19", item: "19", label: "Total Taxes Withheld for the Quarter (Sum of Items 13 to 18)", f: (c) => c.n("13") + c.n("14") + c.n("15"), cols: ["B"], bold: true, key: true },
      { id: "20", item: "20", label: "Less: Remittances Made: 1st Month of the Quarter", cols: ["B"] },
      { id: "21", item: "21", label: "2nd Month of the Quarter", cols: ["B"] },
      { id: "22", item: "22", label: "Tax Remitted in Return Previously Filed, if this is an amended return", cols: ["B"] },
      { id: "23", item: "23", label: "Over-remittance from Previous Quarter of the same taxable year", cols: ["B"] },
      { id: "24", item: "24", label: "Other Payments Made (please attach proof of payments - BIR Form No. 0605)", cols: ["B"] },
      { id: "25", item: "25", label: "Total Remittances Made (Sum of Items 20 to 24)", f: (c) => c.n("20") + c.n("21") + c.n("22") + c.n("23") + c.n("24"), cols: ["B"] },
      { id: "26", item: "26", label: "Tax Still Due/(Over-remittance) (Item 19 Less Item 25)", f: (c) => c.n("19") - c.n("25"), cols: ["B"], bold: true, key: true },
      { heading: "Add: Penalties" },
      { id: "27", item: "27", label: "Surcharge", f: () => 0, cols: ["B"], indent: 1 },
      { id: "28", item: "28", label: "Interest", f: () => 0, cols: ["B"], indent: 1 },
      { id: "29", item: "29", label: "Compromise", cols: ["B"], indent: 1 },
      { id: "30", item: "30", label: "Total Penalties (Sum of Items 27 to 29)", f: () => 0, cols: ["B"] },
      { id: "31", item: "31", label: "TOTAL AMOUNT STILL DUE/(Over-remittance) (Sum of Items 26 and 30)", f: () => 0, cols: ["B"], bold: true, key: true },
    ] },
  ],
  penalty: { base: "26", surcharge: "27", interest: "28", compromise: "29", total: "30", grand: "31", cols: ["B"], gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    if (v["3"] === "yes" && !(Number(v["22B"]) > 0)) out.push({ id: "22B", item: "22", message: "This is an amended return: enter the tax remitted in the return previously filed (Item 22)." });
    if (v["atc14"] === undefined && Number(v["14A"]) > 0) out.push({ id: "atc14", item: "14", message: "Choose the ATC of line 2." });
    if (v["atc15"] === undefined && Number(v["15A"]) > 0) out.push({ id: "atc15", item: "15", message: "Choose the ATC of line 3." });
    return out;
  },
  scoreExtra: [{ id: "atc13", weight: 2 }, { id: "atc14", weight: 2 }, { id: "atc15", weight: 2 }],
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string): Values => ({ "6": `000-${n}-777-00000`, "7": rdo, "8": name, "9": addr, "9A": zip, "10": `0917000${n}`, "11": "private", "12": `q${n}@example.com` });
const common = { "1": "2025", "3": "no", "4": "yes", "5": "1" } as const;

export const CASES = [
  caseOf({
    form: "1601-EQ", level: "easy", year: 2025, title: "A first quarter of service payments",
    story: ["Gapan Grains & Feeds, Inc. (Gapan City 3105) is a top withholding agent. January to March 2025 it paid ₱600,000 to suppliers of services subject to 2% (ATC WC 160). It remitted ₱4,000 with the 0619-E for January and ₱4,000 for February.", "It files and pays the rest on April 29, 2025. Fill in BIR Form 1601-EQ for the first quarter of 2025."],
    profile: P(201, "027", "GAPAN GRAINS & FEEDS, INC.", "NATIONAL HIGHWAY, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "2": "1", atc13: "WC160", "13A": "600000", "20B": "4000", "21B": "4000" },
    filing: "2025-04-29", klass: "small",
    why: "The quarterly reconciliation of expanded withholding is reported with Form 1601-EQ.",
    hints: ["Tax withheld = taxable amount × the ATC's rate.", "Subtract what was already remitted in the first two months.", "The deadline is the last day of the month after the quarter."],
    solution: ["Tax withheld (Item 13B) = 2% × ₱600,000 = ₱12,000 = Item 19.", "Remittances (Item 25) = ₱4,000 + ₱4,000 = ₱8,000. Tax still due (Item 26) = ₱4,000. Due April 30: filed on time; Item 31 = ₱4,000."],
  }),
  caseOf({
    form: "1601-EQ", level: "average", year: 2025, title: "Professional fees and rent, with an over-remittance carried",
    story: ["Mabini Realty Corp. (Cabanatuan City 3100) withheld in April to June 2025: on professional fees to an individual lawyer (gross income below ₱3 million, WI 010, 5%) of ₱400,000, and on rental of real property (WC 100, 5%) of ₱300,000. It remitted ₱10,000 for April and ₱10,000 for May, and has a ₱2,000 over-remittance from the first quarter.", "It files and pays on July 31, 2025. Fill in BIR Form 1601-EQ for the second quarter of 2025."],
    profile: P(202, "025", "MABINI REALTY CORP.", "BRGY. MABINI, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "2": "2", "5": "2", atc13: "WI010", "13A": "400000", atc14: "WC100", "14A": "300000", "20B": "10000", "21B": "10000", "23B": "2000" },
    filing: "2025-07-31", klass: "small",
    why: "The quarterly reconciliation of expanded withholding is reported with Form 1601-EQ.",
    hints: ["Each ATC line has its own rate; both are 5% here.", "The over-remittance from the previous quarter is a credit (Item 23).", "June 30 plus the rest of the month: the last day of July."],
    solution: ["Line 1: 5% × ₱400,000 = ₱20,000. Line 2: 5% × ₱300,000 = ₱15,000. Total taxes withheld (Item 19) = ₱35,000.", "Remittances (Item 25) = ₱10,000 + ₱10,000 + ₱2,000 = ₱22,000. Tax still due (Item 26) = ₱13,000. On time (due July 31): Item 31 = ₱13,000."],
  }),
  caseOf({
    form: "1601-EQ", level: "difficult", year: 2025, title: "Three ATCs and a late quarter",
    story: ["Santos Trading Corp. (Gapan City 3105), a small taxpayer and top withholding agent, withheld in July to September 2025: purchases of goods ₱2,000,000 (WC 158, 1%), services ₱1,500,000 (WC 160, 2%), and professional fees paid to an individual with gross income above ₱3 million ₱500,000 (WI 011, 10%). Remitted: ₱25,000 for July, ₱30,000 for August, and ₱5,000 of other payments.",
      "The quarter's return was due October 31, 2025. It files and pays on November 20, 2025, 20 days late. As a small taxpayer the surcharge is 10% and interest 6% a year by the day over 365; compromise ₱1,000. Fill in BIR Form 1601-EQ for the third quarter of 2025."],
    profile: P(203, "027", "SANTOS TRADING CORP.", "BRGY. MAPALAD, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "2": "3", "5": "3", atc13: "WC158", "13A": "2000000", atc14: "WC160", "14A": "1500000", atc15: "WI011", "15A": "500000", "20B": "25000", "21B": "30000", "24B": "5000", "29B": "1000" },
    filing: "2025-11-20", klass: "small",
    why: "The quarterly reconciliation of expanded withholding is reported with Form 1601-EQ, even when late.",
    hints: ["Goods 1%, services 2%, professional (above ₱3M) 10%.", "Other payments (Item 24) are remittances made with other forms.", "October 31 to November 20 is 20 days."],
    solution: ["Taxes withheld: 1% × ₱2,000,000 = ₱20,000; 2% × ₱1,500,000 = ₱30,000; 10% × ₱500,000 = ₱50,000. Total (Item 19) = ₱100,000.", "Remittances (Item 25) = ₱25,000 + ₱30,000 + ₱5,000 = ₱60,000. Tax still due (Item 26) = ₱40,000.", "Surcharge = 10% × ₱40,000 = ₱4,000; interest = ₱40,000 × 6% × 20 ÷ 365 = ₱131.51 → ₱132; compromise ₱1,000; total penalties ₱5,132. Item 31 = ₱45,132."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1601-EQ: Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)", minutes: "About 7 minutes",
  sections: [
    ["1. What it is", "The 1601-EQ is the quarterly return of expanded (creditable) withholding tax. During the first two months of each quarter the withholding agent remits with Form 0619-E; at the end of the quarter the 1601-EQ reports ALL taxes withheld in the quarter, by ATC, and reconciles them with the remittances already made, so only the third month's tax (and any shortfall) is still due. The return is filed and the tax paid not later than the last day of the month following the close of the quarter (per the form's Guide): April 30, July 31, October 31 and January 31. The payees' Forms 2307 must agree with it, and the year's totals are reported in the annual 1604-E."],
    ["2. Filling it", "Items 13 to 18 list the ATCs, the taxable amounts and the tax withheld (the ATC's rate times the amount). Item 19 totals the taxes withheld. Items 20 and 21 are the remittances of the first and second months (the 0619-E), Item 22 is the tax remitted in the earlier return if amended, Item 23 is an over-remittance from the previous quarter of the same year, and Item 24 other payments. The difference is the tax still due (Item 26). A late return carries surcharge, interest and compromise on Item 26 (25% and 12% in general; 10% and 6% for micro and small taxpayers). This lab shows three ATC lines instead of six, and flags that the ATC rates were not machine-checked against the PDF."],
  ],
  worked: { intro: "A company paid ₱500,000 of services (2%) in the quarter and remitted ₱3,000 and ₱3,000 for the first two months.", steps: ["Tax withheld = ₱10,000; remittances ₱6,000; tax still due ₱4,000."], title: "Form 1601-EQ", table: { "13A": "500,000", "13B": "10,000", "19": "10,000", "25": "6,000", "26": "4,000" } },
  legal: ["NIRC Sec. 57 and 58; RR 2-98 as amended by RR 11-2018; BIR Form 1601-EQ (January 2019 ENCS) and its Guide."],
  guide: [
    ["1 to 5", "1", "Year, quarter, amended, any taxes withheld, sheets.", "Your records.", "Quarter confusion."],
    ["6 to 12", "6", "TIN, RDO, name, address, contact, category, email.", "COR.", "Wrong category."],
    ["13 to 15", "13A", "ATC per line and the taxable amount; the tax withheld is computed.", "Vouchers.", "Wrong ATC rate."],
    ["19", "19", "Computed total taxes withheld for the quarter.", "Computed.", "Typing it."],
    ["20 to 25", "20B", "Remittances: first month, second month, earlier return, previous quarter over-remittance, other payments.", "0619-E, earlier return.", "Forgetting a month."],
    ["26 to 31", "29B", "Computed tax still due; penalties from the filing date; compromise typed.", "Filing date.", "Applying it before the deadline."],
  ],
  checklist: ["Total withholdings by ATC.", "Gather the two 0619-E payments.", "Check any over-remittance of the last quarter.", "Remit by the last day of the next month."],
  pitfalls: ["Reporting only the third month.", "Wrong ATC or rate.", "Missing over-remittance credit.", "Not matching the 2307s."],
  amended: "Tick Yes in Item 3 and enter the tax remitted in the earlier return in Item 22.",
  noPayment: "If remittances cover the quarter's withholding, the tax still due is zero; an over-remittance is carried to the next quarter.",
  quiz: [
    ["The 1601-EQ for April to June is due:", ["June 30", "July 10", "July 31", "August 15"], 2, "The last day of the month following the quarter."],
    ["It reports the withholding of:", ["The third month only", "The whole quarter", "One day", "The year"], 1, "All taxes withheld in the quarter."],
    ["Taxable amount ₱500,000 at 2% gives:", ["₱5,000", "₱10,000", "₱15,000", "₱25,000"], 1, "₱10,000."],
    ["Total withheld ₱35,000, remittances ₱22,000. Still due?", ["₱13,000", "₱22,000", "₱57,000", "₱35,000"], 0, "₱35,000 − ₱22,000."],
    ["The 0619-E is the remittance for:", ["The first two months", "The third month", "A whole year", "Compensation"], 0, "The first two months of the quarter."],
  ],
});
