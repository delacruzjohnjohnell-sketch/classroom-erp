// BIR Form 1604-C, January 2018: Annual Information Return of Income Taxes Withheld on Compensation.
// Item numbers follow docs/bir-forms/1604-C-Jan-2018.pdf. Simplified: the monthly adjustment, penalties and remittance details are totalled in single rows.
import { RULES } from "../rules/2026";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { caseOf, lessonOf, ymd } from "./kit";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const year = (v: Values) => (/^\d{4}$/.test(v["1"] ?? "") ? Number(v["1"]) : 0);

export const DEF = makeForm({
  id: "1604-C", number: "1604-C", title: "Annual Information Return of Income Taxes Withheld on Compensation", subtitle: "Information return: no payment is made with it (RMC 18-2021)",
  version: "January 2018", versionNote: "Official PDF: 1604-C Jan 2018 Final. Taught as due January 31 of the following year (not stated in the PDF; see the rules file).",
  yearId: "1",
  identity: [
    fields(f("1", "1", "For the Year (YYYY)", "year", { span: 3, required: true }), yes("2", "2", "Amended Return?", 3), f("3", "3", "Number of Sheet/s Attached", "count", { span: 3, required: true })),
    fields(f("4", "4", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("5", "5", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("6", "6", "Withholding Agent's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("7", "7", "Registered Address", "text", { span: 9, required: true }), f("7A", "7A", "ZIP Code", "zip", { span: 3, required: true })),
    radio("8", "8", "Category of Withholding Agent", opts(["private", "Private"], ["government", "Government"])),
    fields(yes("8A", "8A", "If private, top withholding agent?", 4), f("9", "9", "Contact Number", "phone", { span: 4 }), f("10", "10", "Email Address", "email", { span: 4 })),
    fields(yes("11", "11", "In case of overwithholding/overremittance after the year-end adjustments, have you released the refund/s to your employee/s?", 8), f("11A", "11A", "Date of refund (MM/DD/YYYY)", "date", { span: 4 })),
    fields(f("13", "13", "Month of First Crediting of Overremittance (MM)", "text", { span: 4 })),
  ],
  required: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }, { id: "6" }, { id: "7" }, { id: "7A" }, { id: "8" }, { id: "8A" }, { id: "11" }].map((r) => ({ ...r, message: `Item ${r.id} is required.` })),
  formats: { tin: ["4"], rdo: ["5"], zip: ["7A"], email: ["10"] },
  sections: [
    { id: "p2", title: "Part II – Summary of Remittances per BIR Form No. 1601-C", note: "Taxes withheld per month (the month's 1601-C). DO NOT enter Centavos.", lines: [
      ...MONTHS.map((m, i) => ({ id: `w${i + 1}`, item: m, label: `${m}: Taxes Withheld` })),
      { id: "wT", item: "TOTAL", label: "TOTAL Taxes Withheld", f: (c) => Array.from({ length: 12 }, (_, i) => c.n(`w${i + 1}`)).reduce((a, b) => a + b, 0), bold: true, key: true },
      { id: "adj", item: "Adjustment", label: "Total adjustments for the year (year-end adjustment, negative for a refund)", signed: true },
      { id: "pen", item: "Penalties", label: "Total penalties paid with the 1601-C returns" },
      { id: "rem", item: "Total remitted", label: "TOTAL Amount Remitted (Taxes Withheld + Adjustment + Penalties)", f: (c) => c.n("wT") + c.n("adj") + c.n("pen"), bold: true, key: true },
      { id: "12", item: "12", label: "Total amount of overremittance on tax withheld under compensation" },
    ] },
  ],
  due: (v) => (year(v) ? ymd(year(v) + 1, RULES.informationReturnDue.form1604C.month, RULES.informationReturnDue.form1604C.day) : ""),
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    if (Number(v["12A"]) > 0 && v["11"] === "yes" && !v["11A"]) out.push({ id: "11A", item: "11A", message: "You released a refund: enter the date of refund (Item 11A)." });
    if (Number(v["12A"]) > 0 && !(v["13"] ?? "").trim()) out.push({ id: "13", item: "13", message: "Enter the month of first crediting of the overremittance (Item 13)." });
    return out;
  },
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string, extra: Values = {}): Values => ({ "4": `000-${n}-111-00000`, "5": rdo, "6": name, "7": addr, "7A": zip, "9": `0917000${n}`, "10": `payroll${n}@example.com`, ...extra });
const common = { "1": "2025", "2": "no", "8": "private", "8A": "no" } as const;
const flat = (amount: string) => Object.fromEntries(MONTHS.map((_, i) => [`w${i + 1}A`, amount]));

export const CASES = [
  caseOf({
    form: "1604-C", level: "easy", year: 2025, title: "A steady payroll",
    story: ["Nueva Ecija School Supply Corp. (Cabanatuan City) withheld and remitted ₱15,000 of compensation tax every month of 2025 with its 1601-C returns. No adjustment, no penalties, no overremittance.", "Prepare the annual information return 1604-C for 2025 with one attachment (the alphalist). It is due January 31, 2026; nothing is paid with it."],
    profile: P(111, "025", "NUEVA ECIJA SCHOOL SUPPLY CORP.", "POBLACION, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "3": "1", "11": "no", ...flat("15000") },
    filing: "2026-01-20",
    why: "An employer reports the year's compensation tax withheld with the annual information return 1604-C.",
    hints: ["Enter each month's tax withheld; the total is computed.", "Total remitted = taxes withheld + adjustment + penalties.", "An information return has no payment."],
    solution: ["Taxes withheld: ₱15,000 × 12 = ₱180,000 (TOTAL).", "No adjustment or penalties: total amount remitted = ₱180,000."],
  }),
  caseOf({
    form: "1604-C", level: "average", year: 2025, title: "A year-end adjustment and a late month",
    story: ["Santos Poultry Farm, Inc. (San Jose City) withheld on compensation: January to June ₱20,000 each month; July to November ₱24,000 each month; December ₱30,000. The December 1601-C was filed late and the ₱2,000 penalty was paid with it. At the year-end adjustment ₱5,000 was over-withheld and refunded to employees on December 28, 2025, so the adjustment is (₱5,000) and the total overremittance (Item 12) is ₱5,000, first credited in January (01).", "Prepare the 1604-C for 2025 with two attachments."],
    profile: P(112, "026", "SANTOS POULTRY FARM, INC.", "BRGY. SAN AGUSTIN, SAN JOSE CITY, NUEVA ECIJA", "3121"),
    facts: { ...common, "3": "2", "11": "yes", "11A": "12/28/2025", "13": "01", w1A: "20000", w2A: "20000", w3A: "20000", w4A: "20000", w5A: "20000", w6A: "20000", w7A: "24000", w8A: "24000", w9A: "24000", w10A: "24000", w11A: "24000", w12A: "30000", adjA: "-5000", penA: "2000", "12A": "5000" },
    filing: "2026-01-25",
    why: "An employer reports the year's compensation tax withheld with 1604-C.",
    hints: ["Add the twelve months; the total is computed.", "The adjustment is negative because tax was refunded.", "Penalties paid with 1601-C returns are added in the total remitted."],
    solution: ["Taxes withheld = 6 × ₱20,000 + 5 × ₱24,000 + ₱30,000 = ₱120,000 + ₱120,000 + ₱30,000 = ₱270,000.", "Total remitted = ₱270,000 − ₱5,000 + ₱2,000 = ₱267,000."],
  }),
  caseOf({
    form: "1604-C", level: "difficult", year: 2025, title: "Overremittance refunded, government check",
    story: ["Gapan Manufacturing Corp. (Gapan City) withheld on compensation ₱32,000 a month for January to October and ₱38,000 a month for November and December. A payroll check found ₱8,000 over-remitted; at the year-end adjustment it was refunded to the employees on December 29, 2025. The adjustment is (₱8,000), there were no penalties, the total overremittance (Item 12) is ₱8,000, and it was first credited in December (12).", "Prepare the original 1604-C for 2025 (Item 2 = No) with three attachments."],
    profile: P(113, "027", "GAPAN MANUFACTURING CORP.", "BRGY. MAPALAD, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "3": "3", "11": "yes", "11A": "12/29/2025", "13": "12", w1A: "32000", w2A: "32000", w3A: "32000", w4A: "32000", w5A: "32000", w6A: "32000", w7A: "32000", w8A: "32000", w9A: "32000", w10A: "32000", w11A: "38000", w12A: "38000", adjA: "-8000", "12A": "8000" },
    filing: "2026-01-29",
    why: "An employer reports the year's compensation tax withheld with 1604-C, including any overremittance.",
    hints: ["Ten months at one amount, two at another.", "Item 12 repeats the overremittance; Items 11, 11A and 13 describe the refund.", "Total remitted nets the adjustment."],
    solution: ["Taxes withheld = 10 × ₱32,000 + 2 × ₱38,000 = ₱320,000 + ₱76,000 = ₱396,000.", "Total remitted = ₱396,000 − ₱8,000 + ₱0 = ₱388,000."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1604-C: Annual Information Return of Income Taxes Withheld on Compensation", minutes: "About 5 minutes",
  sections: [
    ["1. What it is", "Employers (withholding agents) file the monthly 1601-C to remit tax withheld on compensation. After the year, the annual information return 1604-C summarizes the twelve months' remittances and is accompanied by an alphalist of employees. It is only an information return: RMC 18-2021 says no payment is made with 1604-C, 1604-E or 1604-F. It is taught as due January 31 of the following year (the deadline is not printed on the PDF; see the rules file)."],
    ["2. Filling it", "Part I identifies the withholding agent (private or government; top withholding agent or not). Part II lists the taxes withheld for each month; the monthly figures must agree with the 1601-C returns. After the year-end adjustment, if tax was over-withheld and refunded to employees (or over-remitted), Items 11 to 13 report it: whether refunds were released, the date, the amount of overremittance and the month it was first credited. The total amount remitted equals taxes withheld plus adjustments plus penalties."],
    ["3. Why it matters", "The BIR matches the 1604-C against the 1601-C remittances and against the employees' 2316s. A mismatch triggers an audit letter. Failure to file carries a penalty for each failure (the 1604-E guidance quotes ₱1,000 per failure with a ₱25,000 yearly cap)."],
  ],
  worked: { intro: "A company withheld ₱10,000 each month for 12 months with no adjustment.", steps: ["Total taxes withheld = ₱120,000; total remitted = ₱120,000."], title: "Form 1604-C", table: { "TOTAL": "120,000", "Total remitted": "120,000" } },
  legal: ["NIRC Sec. 58 (returns of withholding), Sec. 83; RR 2-98 as amended; BIR Form 1604-C (January 2018); RMC 18-2021 (information returns, no payment)."],
  guide: [
    ["1 to 3", "1", "Year, amended or not, number of sheets.", "Your records.", "Filing year instead of the taxable year."],
    ["4 to 10", "4", "Agent's TIN, RDO, name, address, category, top withholding agent, contact, email.", "COR.", "Wrong category."],
    ["11, 11A, 12, 13", "11", "Overremittance: refund released, date, amount, month of first crediting.", "Year-end adjustment.", "Missing the date."],
    ["Part II months", "w1A", "Taxes withheld for each month, as filed in the 1601-C.", "1601-C returns.", "Different from the 1601-C."],
    ["TOTAL", "wT", "Computed total of the twelve months.", "Computed.", "Typing it."],
    ["Adjustment, penalties", "adj", "Year-end adjustment (negative if refunded), and penalties paid.", "Payroll.", "Wrong sign."],
  ],
  checklist: ["Get the twelve 1601-C returns.", "Reconcile with payroll.", "Prepare the alphalist.", "File by January 31."],
  pitfalls: ["Monthly figures differing from the 1601-C.", "Forgetting the year-end adjustment.", "Treating it as a payment return."],
  amended: "Tick Yes in Item 2 to correct a filed 1604-C.",
  noPayment: "It is an information return: no payment is made.",
  quiz: [
    ["Is a payment made with 1604-C?", ["Yes", "No", "Only if late", "Only if government"], 1, "RMC 18-2021: information returns, no payment."],
    ["Monthly ₱10,000 for 12 months. Total taxes withheld?", ["₱10,000", "₱100,000", "₱120,000", "₱12,000"], 2, "12 × ₱10,000."],
    ["Total remitted formula:", ["Withheld − penalties", "Withheld + adjustment + penalties", "Withheld only", "Adjustment only"], 1, "The form totals the remitted amount."],
    ["A refund to employees is recorded as a:", ["Positive adjustment", "Negative adjustment", "Penalty", "Credit"], 1, "A deduction from the amount remitted."],
    ["1604-C reports taxes withheld on:", ["Rent", "Compensation", "Dividends", "Interest"], 1, "Compensation."],
  ],
});
