// BIR Form 0619-E, January 2018: Monthly Remittance Form of Creditable Income Taxes Withheld (Expanded).
// Source: docs/bir-forms/0619-E-Guide-Jan-2018.pdf (Guidelines and Instructions only). The form PDF itself could not be downloaded from bir.gov.ph, so the item labels below are descriptive,
// not the printed item numbers; the deadline, who files and the penalties are from the Guidelines. Verify the layout against the form before using it in class.
import { RULES } from "../rules/2026";
import { f, fields, makeForm, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { caseOf, dayOfNextMonth, lessonOf, parseMonth } from "./kit";

function dueOf(v: Values): string {
  const p = parseMonth(v["1"]);
  return p ? dayOfNextMonth(p[1], p[0], RULES.withholdingDue.monthlyDay) : "";
}

export const DEF = makeForm({
  id: "0619-E", number: "0619-E", title: "Monthly Remittance Form of Creditable Income Taxes Withheld (Expanded)", subtitle: "For the first two months of each calendar quarter; the third month is in the 1601-EQ",
  version: "January 2018", versionNote: "Built from the Guidelines and Instructions (0619-E Jan 2018). The form PDF was not obtainable; item labels are descriptive. Due on or before the 10th day following the month of withholding (Guidelines).",
  yearId: "1",
  identity: [
    fields(f("1", "Month", "For the Month (MM/YYYY) - first or second month of the quarter", "monthyear", { span: 4, required: true }), yes("2", "Amended", "Amended Form?", 3), yes("3", "Taxes", "Any Taxes Withheld?", 3)),
    fields(f("4", "TIN", "Withholding Agent's Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("5", "RDO", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("6", "Name", "Withholding Agent's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("7", "Address", "Registered Address", "text", { span: 9, required: true }), f("7A", "ZIP", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("8", "Contact", "Contact Number", "phone", { span: 5 }), f("9", "Email", "Email Address", "email", { span: 7 })),
  ],
  required: ["1", "2", "3", "4", "5", "6", "7", "7A"].map((id) => ({ id, message: `This item is required.` })),
  formats: { tin: ["4"], rdo: ["5"], zip: ["7A"], email: ["9"] },
  sections: [
    { id: "p2", title: "Tax Remittance", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "r1", item: "Remit-1", label: "Amount of Remittance (creditable income taxes withheld, expanded, for the month)", key: true },
      { id: "r2", item: "Remit-2", label: "Less: Amount Remitted in Return Previously Filed, if this is an amended form" },
      { id: "r3", item: "Remit-3", label: "Remittance Still Due/(Over-remittance) (Remit-1 Less Remit-2)", f: (c) => c.n("r1") - c.n("r2"), bold: true, key: true },
      { heading: "Add: Penalties" },
      { id: "r4", item: "Remit-4", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "r5", item: "Remit-5", label: "Interest", f: () => 0, indent: 1 },
      { id: "r6", item: "Remit-6", label: "Compromise", indent: 1 },
      { id: "r7", item: "Remit-7", label: "Total Penalties (Sum of Remit-4 to Remit-6)", f: () => 0 },
      { id: "r8", item: "Remit-8", label: "TOTAL AMOUNT STILL DUE/(Over-remittance) (Remit-3 plus Remit-7)", f: () => 0, bold: true, key: true },
    ] },
  ],
  penalty: { base: "r3", surcharge: "r4", interest: "r5", compromise: "r6", total: "r7", grand: "r8", gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    const p = parseMonth(v["1"]);
    if (p && p[0] % 3 === 0) out.push({ id: "1", item: "Month", message: "The 0619-E is filed only for the first two months of each calendar quarter. The third month's withholding is reported in the quarterly 1601-EQ." });
    if (v["2"] === "yes" && !(Number(v["r2A"]) > 0)) out.push({ id: "r2A", item: "Remit-2", message: "This is an amended form: enter the amount remitted in the form previously filed." });
    return out;
  },
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string): Values => ({ "4": `000-${n}-666-00000`, "5": rdo, "6": name, "7": addr, "7A": zip, "8": `0917000${n}`, "9": `ewt${n}@example.com` });
const common = { "2": "no", "3": "yes" } as const;

export const CASES = [
  caseOf({
    form: "0619-E", level: "easy", year: 2025, title: "January remittance",
    story: ["Gapan Grains & Feeds, Inc. (Gapan City 3105) withheld ₱12,000 of expanded (creditable) income tax from payments to suppliers and professionals during January 2025. It files and remits on February 7, 2025.", "Fill in BIR Form 0619-E for 01/2025."],
    profile: P(191, "027", "GAPAN GRAINS & FEEDS, INC.", "NATIONAL HIGHWAY, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "1": "01/2025", r1A: "12000" },
    filing: "2025-02-07", klass: "small",
    why: "Monthly remittances of expanded withholding for the first two months of a quarter use Form 0619-E.",
    hints: ["January is the first month of the quarter.", "The remittance is due on the 10th day of the next month.", "There is nothing remitted earlier, so the whole amount is due."],
    solution: ["Amount of remittance ₱12,000; nothing remitted earlier; remittance still due ₱12,000. Due February 10: filed on time. Total ₱12,000."],
  }),
  caseOf({
    form: "0619-E", level: "average", year: 2025, title: "An amended February form",
    story: ["Mabini Realty Corp. (Cabanatuan City 3100) remitted ₱10,000 for February 2025 on its first 0619-E. After a review the correct withheld amount is ₱18,500. It files an AMENDED 0619-E for 02/2025 on March 10, 2025.", "Fill in BIR Form 0619-E (amended)."],
    profile: P(192, "025", "MABINI REALTY CORP.", "BRGY. MABINI, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "1": "02/2025", "2": "yes", r1A: "18500", r2A: "10000" },
    filing: "2025-03-10", klass: "small",
    why: "An amended monthly remittance of expanded withholding uses Form 0619-E.",
    hints: ["Tick Yes for the amended form and enter the earlier remittance.", "The still-due amount is the correct total less what was already remitted.", "March 10 is the due date, so no penalties."],
    solution: ["Correct remittance ₱18,500, less ₱10,000 already remitted: remittance still due ₱8,500. Filed on the due date: total ₱8,500."],
  }),
  caseOf({
    form: "0619-E", level: "difficult", year: 2025, title: "A May remittance filed late",
    story: ["Nueva Ecija Hardware Supply Corp. (Cabanatuan City 3100), a small taxpayer, withheld ₱40,000 of expanded tax during May 2025 (the second month of the second quarter). The due date was June 10, 2025; it files and remits on June 30, 2025, 20 days late.", "As a small taxpayer the surcharge is 10% and interest 6% a year by the day over 365; compromise ₱500. Fill in BIR Form 0619-E for 05/2025. (Note: June, the third month, would NOT use this form.)"],
    profile: P(193, "025", "NUEVA ECIJA HARDWARE SUPPLY CORP.", "BRGY. BURGOS, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "1": "05/2025", r1A: "40000", r6A: "500" },
    filing: "2025-06-30", klass: "small",
    why: "Monthly remittances of expanded withholding for the first two months of a quarter use Form 0619-E.",
    hints: ["May is the second month of the quarter: 0619-E applies.", "June 10 to June 30 is 20 days.", "Penalties are computed on the remittance still due."],
    solution: ["Remittance still due = ₱40,000. Surcharge = 10% × ₱40,000 = ₱4,000; interest = ₱40,000 × 6% × 20 ÷ 365 = ₱131.51 → ₱132; compromise ₱500; total penalties ₱4,632. Total amount still due = ₱44,632."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 0619-E: Monthly Remittance of Creditable Income Taxes Withheld (Expanded)", minutes: "About 4 minutes",
  sections: [
    ["1. What it is", "A withholding agent that withholds expanded (creditable) income tax from payments to suppliers, professionals, contractors and others remits it monthly. For the FIRST TWO months of each calendar quarter it uses Form 0619-E, filed and remitted on or before the tenth (10th) day following the month in which the withholding was made (the Guidelines). The THIRD month of the quarter is not remitted with 0619-E: it is covered by the quarterly return 1601-EQ, which reconciles the whole quarter."],
    ["2. Penalties and notes", "A late 0619-E has a surcharge, interest and compromise computed on the remittance still due (25% and 12% a year in general; 10% and 6% for micro and small taxpayers). If the form is amended, the amount already remitted in the earlier form is deducted. This lab built the form from the Guidelines only (the form PDF itself was not available), so its item numbers are descriptive."],
  ],
  worked: { intro: "A company withheld ₱15,000 in January and files on time.", steps: ["Remittance ₱15,000; still due ₱15,000."], title: "Form 0619-E", table: { "Remit-1": "15,000", "Remit-3": "15,000", "Remit-8": "15,000" } },
  legal: ["NIRC Sec. 57, Sec. 58; RR 2-98 as amended by RR 11-2018; Guidelines and Instructions for BIR Form 0619-E (January 2018)."],
  guide: [
    ["Month", "1", "The month (MM/YYYY): only the first or second month of a quarter.", "Your withholding records.", "Using it for the third month."],
    ["Agent", "4", "TIN, RDO, name, address, contact, email.", "COR.", "Wrong RDO."],
    ["Remit-1/2", "r1A", "The amount withheld for the month; the amount remitted earlier if amended.", "Vouchers, 2307s issued.", "Counting the quarter."],
    ["Remit-3", "r3A", "Computed remittance still due.", "Computed.", "Typing it."],
    ["Penalties", "r6A", "Computed surcharge and interest from the filing date; compromise typed.", "Filing date.", "Applying it to on-time forms."],
  ],
  checklist: ["Check that the month is the 1st or 2nd of the quarter.", "Total the withholdings for the month.", "Remit by the 10th of the next month."],
  pitfalls: ["0619-E for the third month.", "Late remittance.", "Not deducting an earlier remittance in an amended form."],
  amended: "Tick Yes and enter the earlier remittance.",
  noPayment: "If no taxes were withheld in the month, answer No to 'Any Taxes Withheld?'.",
  quiz: [
    ["For which months of the quarter is 0619-E filed?", ["First two", "Last", "All three", "None"], 0, "The first two months."],
    ["It is due on or before the:", ["5th", "10th", "15th", "25th"], 1, "The tenth day following the month."],
    ["The third month of the quarter is reported in the:", ["0619-E", "1601-EQ", "2550Q", "1700"], 1, "In the quarterly 1601-EQ."],
    ["Correct remittance ₱20,000, already remitted ₱12,000. Still due?", ["₱8,000", "₱12,000", "₱20,000", "₱32,000"], 0, "₱20,000 − ₱12,000."],
    ["Who files it?", ["Employees", "Withholding agents", "The BIR", "Banks only"], 1, "Withholding agents."],
  ],
});
