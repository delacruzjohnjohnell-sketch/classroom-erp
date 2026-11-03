// BIR Form 1601-C, January 2018 (ENCS): Monthly Remittance Return of Income Taxes Withheld on Compensation.
// Item numbers follow docs/bir-forms/1601-C-Jan-2018.pdf. Due: 10th day of the following month; December: January 15 (its Guidelines). Simplified: Schedule 1 (adjustments) is a single typed total (Item 26).
import { RULES } from "../rules/2026";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { caseOf, dayOfNextMonth, lessonOf, parseMonth } from "./kit";

function dueOf(v: Values): string {
  const p = parseMonth(v["1"]);
  if (!p) return "";
  const [m, y] = p;
  return dayOfNextMonth(y, m, m === 12 ? RULES.withholdingDue.decemberCompensationDay : RULES.withholdingDue.monthlyDay);
}

export const DEF = makeForm({
  id: "1601-C", number: "1601-C", title: "Monthly Remittance Return of Income Taxes Withheld on Compensation", subtitle: "Withholding agents: employers",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 1601C final Jan 2018 with DPA. Due on or before the 10th day of the month following; December on or before January 15 (Guidelines and Instructions).",
  yearId: "1",
  identity: [
    fields(f("1", "1", "For the Month (MM/YYYY)", "monthyear", { span: 3, required: true }), yes("2", "2", "Amended Return?", 3), yes("3", "3", "Any Taxes Withheld?", 3), f("4", "4", "Number of Sheet/s Attached", "count", { span: 3, required: true })),
    fields(f("5", "5", "Alphanumeric Tax Code (ATC)", "radio", { span: 12, options: opts(["WW010", "WW010 Withholding on compensation"]), required: true })),
    fields(f("6", "6", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("7", "7", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("8", "8", "Withholding Agent's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("9", "9", "Registered Address", "text", { span: 9, required: true }), f("9A", "9A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("10", "10", "Contact Number", "phone", { span: 4 }), f("11", "11", "Category of Withholding Agent", "radio", { span: 4, options: opts(["private", "Private"], ["government", "Government"]), required: true }), f("12", "12", "Email Address", "email", { span: 4 })),
    radio("13", "13", "Are there payees availing of tax relief under Special Law or International Tax Treaty?", opts(["yes", "Yes"], ["no", "No"])),
  ],
  required: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "9A", "11", "13"].map((id) => ({ id, message: `Item ${id} is required.` })),
  formats: { tin: ["6"], rdo: ["7"], zip: ["9A"], email: ["12"] },
  sections: [
    { id: "p2", title: "Part II – Computation of Tax", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "14", item: "14", label: "Total Amount of Compensation" },
      { id: "15", item: "15", label: "Statutory Minimum Wage for Minimum Wage Earners (MWEs)" },
      { id: "16", item: "16", label: "Holiday Pay, Overtime Pay, Night Shift Differential Pay, Hazard Pay (for MWEs only)" },
      { id: "17", item: "17", label: "13th Month Pay and Other Benefits" },
      { id: "18", item: "18", label: "De Minimis Benefits" },
      { id: "19", item: "19", label: "SSS, GSIS, PHIC, HDMF Mandatory Contributions & Union Dues (employee's share only)" },
      { id: "20", item: "20", label: "Other Non-Taxable Compensation (specify)", specify: true },
      { id: "21", item: "21", label: "Total Non-Taxable Compensation (Sum of Items 15 to 20)", f: (c) => c.n("15") + c.n("16") + c.n("17") + c.n("18") + c.n("19") + c.n("20"), key: true },
      { id: "22", item: "22", label: "Total Taxable Compensation (Item 14 Less Item 21)", f: (c) => c.n("14") - c.n("21") },
      { id: "23", item: "23", label: "Less: Taxable compensation not subject to withholding tax (for employees, other than MWEs, receiving P250,000 & below for the year)" },
      { id: "24", item: "24", label: "Net Taxable Compensation (Item 22 Less Item 23)", f: (c) => c.n("22") - c.n("23"), key: true },
      { id: "25", item: "25", label: "Total Taxes Withheld" },
      { id: "26", item: "26", label: "Add/(Less): Adjustment of Taxes Withheld from Previous Month/s (From Part IV - Schedule 1 Item 4)", signed: true },
      { id: "27", item: "27", label: "Taxes Withheld for Remittance (Sum of Items 25 and 26)", f: (c) => c.n("25") + c.n("26"), bold: true, key: true },
      { id: "28", item: "28", label: "Less: Tax Remitted in Return Previously Filed, if this is an amended return" },
      { id: "29", item: "29", label: "Other Remittances Made (specify)", specify: true },
      { id: "30", item: "30", label: "Total Tax Remittances Made (Sum of Items 28 and 29)", f: (c) => c.n("28") + c.n("29") },
      { id: "31", item: "31", label: "Tax Still Due/(Over-remittance) (Item 27 Less Item 30)", f: (c) => c.n("27") - c.n("30"), bold: true, key: true },
      { heading: "Add: Penalties" },
      { id: "32", item: "32", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "33", item: "33", label: "Interest", f: () => 0, indent: 1 },
      { id: "34", item: "34", label: "Compromise", indent: 1 },
      { id: "35", item: "35", label: "Total Penalties (Sum of Items 32 to 34)", f: () => 0 },
      { id: "36", item: "36", label: "TOTAL AMOUNT STILL DUE/(Over-remittance) (Sum of Items 31 and 35)", f: () => 0, bold: true, key: true },
    ] },
  ],
  penalty: { base: "31", surcharge: "32", interest: "33", compromise: "34", total: "35", grand: "36", gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    if (v["3"] === "no" && Number(v["25A"]) > 0) out.push({ id: "3", item: "3", message: "You entered taxes withheld, so 'Any Taxes Withheld?' is Yes." });
    if (v["3"] === "yes" && !(Number(v["25A"]) > 0) && !(Number(v["26A"]) !== 0)) out.push({ id: "25A", item: "25", message: "Taxes were withheld: enter the total taxes withheld (Item 25)." });
    if (v["2"] === "yes" && !(Number(v["28A"]) > 0)) out.push({ id: "28A", item: "28", message: "This is an amended return: enter the tax remitted in the return previously filed (Item 28)." });
    if (Number(v["17A"]) > 90000) out.push({ id: "17A", item: "17", message: "13th month pay and other benefits are exempt only up to P90,000 per employee; the part above is taxable (Item 22)." });
    return out;
  },
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string, klass: string): Values => ({ "6": `000-${n}-555-00000`, "7": rdo, "8": name, "9": addr, "9A": zip, "10": `0917000${n}`, "12": `hr${n}@example.com`, "11": klass });
const common = { "2": "no", "3": "yes", "4": "1", "5": "WW010", "13": "no" } as const;

export const CASES = [
  caseOf({
    form: "1601-C", level: "easy", year: 2025, title: "March payroll of a school",
    story: ["Cabanatuan Learning Center, Inc. (private employer, Cabanatuan City 3100) paid total compensation of ₱400,000 for March 2025. Of this, de minimis benefits ₱10,000 and employee SSS/PhilHealth/Pag-IBIG contributions ₱20,000 are non-taxable. Employees earning ₱250,000 a year or less had ₱100,000 of compensation not subject to withholding. The tax withheld was ₱18,500. No adjustments.", "It files and remits on April 9, 2025. Fill in BIR Form 1601-C for 03/2025."],
    profile: P(181, "025", "CABANATUAN LEARNING CENTER, INC.", "BRGY. SANGITAN, CABANATUAN CITY, NUEVA ECIJA", "3100", "private"),
    facts: { ...common, "1": "03/2025", "14A": "400000", "18A": "10000", "19A": "20000", "23A": "100000", "25A": "18500" },
    filing: "2025-04-09", klass: "small",
    why: "An employer remits the tax withheld on compensation each month with Form 1601-C.",
    hints: ["Non-taxable compensation (Item 21) is the sum of Items 15 to 20.", "Item 24 is taxable compensation less the part not subject to withholding.", "Item 31 is the tax still due after remittances."],
    solution: ["Non-taxable (Item 21) = ₱10,000 + ₱20,000 = ₱30,000. Taxable (Item 22) = ₱370,000. Net taxable (Item 24) = ₱270,000.", "Taxes withheld (Item 25) = ₱18,500 = Item 27. No previous remittance: Item 31 = ₱18,500. Due April 10: filed on time; Item 36 = ₱18,500."],
  }),
  caseOf({
    form: "1601-C", level: "average", year: 2025, title: "An amended June return with an adjustment",
    story: ["San Jose Metal Works, Inc. (private, San Jose City 3121) filed its June 2025 1601-C showing taxes withheld of ₱15,000 and paid that. It now files an AMENDED return for 06/2025 on July 10, 2025: total compensation ₱520,000; non-taxable 13th month and other benefits ₱30,000, de minimis ₱8,000, contributions ₱27,000; compensation not subject to withholding ₱90,000. Correct taxes withheld ₱21,000, less an adjustment of (₱1,000) for over-withholding in May that was refunded. It already remitted ₱15,000.", "Fill in BIR Form 1601-C for 06/2025 (amended)."],
    profile: P(182, "026", "SAN JOSE METAL WORKS, INC.", "BRGY. CRUZ NA LIGAS, SAN JOSE CITY, NUEVA ECIJA", "3121", "private"),
    facts: { ...common, "1": "06/2025", "2": "yes", "4": "2", "14A": "520000", "17A": "30000", "18A": "8000", "19A": "27000", "23A": "90000", "25A": "21000", "26A": "-1000", "28A": "15000" },
    filing: "2025-07-10", klass: "small",
    why: "An employer corrects a monthly withholding remittance with an amended Form 1601-C.",
    hints: ["Tick Yes in Item 2 and enter the earlier remittance in Item 28.", "The adjustment is negative (a refund of over-withholding).", "Item 27 is taxes withheld plus the adjustment."],
    solution: ["Non-taxable (Item 21) = ₱65,000; taxable (Item 22) = ₱455,000; net taxable (Item 24) = ₱365,000.", "Taxes withheld for remittance (Item 27) = ₱21,000 − ₱1,000 = ₱20,000. Less tax remitted in the earlier return ₱15,000: tax still due (Item 31) = ₱5,000. Filed on the due date (July 10): Item 36 = ₱5,000."],
  }),
  caseOf({
    form: "1601-C", level: "difficult", year: 2025, title: "December: the January 15 deadline, missed",
    story: ["Gapan Polymer Corp. (private, Gapan City 3105), a small taxpayer, remits the December 2025 withholding on compensation. Total compensation ₱900,000; non-taxable: 13th month pay and other benefits ₱90,000 (the exempt maximum per the average), de minimis ₱25,000, contributions ₱45,000, other non-taxable ₱10,000 (specify REPRESENTATION ALLOWANCE REIMBURSED). Compensation not subject to withholding ₱150,000. Taxes withheld ₱52,000, plus an adjustment of ₱3,000 for under-withholding in earlier months.", "December taxes are due January 15, 2026. It files and pays on February 5, 2026 (21 days late). As a small taxpayer the surcharge is 10% and interest 6% a year by the day over 365; compromise ₱1,000. Fill in BIR Form 1601-C for 12/2025."],
    profile: P(183, "027", "GAPAN POLYMER CORP.", "BRGY. SAN JOSE, GAPAN CITY, NUEVA ECIJA", "3105", "private"),
    facts: { ...common, "1": "12/2025", "4": "2", "14A": "900000", "17A": "90000", "18A": "25000", "19A": "45000", "20A": "10000", "20S": "REPRESENTATION ALLOWANCE REIMBURSED", "23A": "150000", "25A": "52000", "26A": "3000", "34A": "1000" },
    filing: "2026-02-05", klass: "small",
    why: "An employer remits the tax withheld on compensation each month with Form 1601-C, December included.",
    hints: ["For December the deadline is January 15 of the next year, not the 10th.", "The adjustment is an under-withholding catch-up, so it is positive.", "Penalties are computed on Item 31."],
    solution: ["Non-taxable (Item 21) = ₱90,000 + ₱25,000 + ₱45,000 + ₱10,000 = ₱170,000. Taxable (Item 22) = ₱730,000; net taxable (Item 24) = ₱580,000.", "Taxes withheld for remittance (Item 27) = ₱52,000 + ₱3,000 = ₱55,000 = Item 31.", "Due January 15, 2026; filed February 5 = 21 days late. Surcharge = 10% × ₱55,000 = ₱5,500; interest = ₱55,000 × 6% × 21 ÷ 365 = ₱189.86 → ₱190; compromise ₱1,000; total penalties ₱6,690. Item 36 = ₱61,690."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1601-C: Monthly Remittance Return of Income Taxes Withheld on Compensation", minutes: "About 6 minutes",
  sections: [
    ["1. Who files and when", "An employer is a withholding agent: it must withhold income tax from the compensation it pays and remit it monthly with Form 1601-C. The return is filed and the tax remitted on or before the 10th day of the month following the month of withholding, except that the December withholding is due on or before January 15 of the next year (per the form's Guidelines and Instructions). The ATC for compensation is WW 010. At year-end the employer summarizes the twelve months in the 1604-C and issues a 2316 to each employee."],
    ["2. Computing", "Part II starts with the total compensation paid in the month (Item 14), subtracts the non-taxable parts: statutory minimum wage and related items of minimum wage earners, 13th month pay and other benefits (exempt up to ₱90,000 per employee in the year), de minimis benefits, employee shares of SSS, GSIS, PhilHealth and Pag-IBIG contributions and union dues, and other non-taxable items (Items 15 to 21). Taxable compensation (Item 22) less the part not subject to withholding (employees who earn ₱250,000 and below for the year, Item 23) gives the net taxable compensation (Item 24). The tax withheld (Item 25) comes from the withholding tax table; with an adjustment for earlier months (Item 26) it becomes the taxes withheld for remittance (Item 27). Remittances already made (Items 28 and 29, for example in an earlier return of an amended filing) reduce it to the tax still due (Item 31)."],
    ["3. Penalties", "A late 1601-C has a surcharge, interest and compromise computed on the tax still due: 25% and 12% a year in general; 10% and 6% for micro and small taxpayers (the 1601-C Guidelines list the general rates). Willful failure to withhold or remit is a criminal offense."],
  ],
  worked: { intro: "Payroll ₱300,000; contributions ₱15,000; ₱60,000 not subject to withholding; tax withheld ₱9,000.", steps: ["Non-taxable ₱15,000; taxable ₱285,000; net taxable ₱225,000.", "Taxes withheld for remittance ₱9,000; nothing remitted yet, so tax still due ₱9,000."], title: "Form 1601-C", table: { "14": "300,000", "21": "15,000", "22": "285,000", "24": "225,000", "27": "9,000", "31": "9,000" } },
  legal: ["NIRC Sec. 79 (withholding on compensation), Sec. 58; RR 2-98 as amended by RR 11-2018; BIR Form 1601-C (January 2018 ENCS) and its Guidelines and Instructions."],
  guide: [
    ["1 to 5", "1", "Month (MM/YYYY), amended, any taxes withheld, sheets, ATC WW 010.", "Payroll.", "Wrong month."],
    ["6 to 13", "6", "TIN, RDO, name, address, contact, category, email, tax relief.", "COR.", "Wrong category."],
    ["14 to 21", "14A", "Total compensation and the non-taxable items; the total is computed.", "Payroll register.", "13th month above ₱90,000."],
    ["22 to 24", "23A", "Computed taxable compensation; the part not subject to withholding; net taxable.", "Payroll.", "Forgetting Item 23."],
    ["25 to 27", "25A", "Total taxes withheld; adjustment of earlier months (negative if refunded); taxes for remittance.", "Withholding table.", "Wrong sign of adjustment."],
    ["28 to 31", "28A", "Tax remitted in an earlier return; other remittances; tax still due.", "Earlier return.", "Missing the earlier remittance."],
    ["32 to 36", "34A", "Penalties from the filing date; compromise typed; total.", "Filing date.", "Applying the 10th to December."],
  ],
  checklist: ["Reconcile payroll to the month.", "Separate the non-taxable items.", "Check the due date (December: January 15).", "Keep proof of remittance for the 1604-C."],
  pitfalls: ["December due date.", "Not removing the part not subject to withholding.", "Positive adjustment when tax was refunded.", "13th month pay above ₱90,000 left as exempt."],
  amended: "Tick Yes in Item 2 and enter the tax remitted in the earlier return in Item 28.",
  noPayment: "If no taxes were withheld, answer No in Item 3 and still file.",
  quiz: [
    ["The 1601-C for the month of March is due:", ["March 31", "April 10", "April 15", "May 10"], 1, "The 10th day of the following month."],
    ["The December 1601-C is due:", ["January 10", "January 15", "January 31", "February 10"], 1, "On or before January 15."],
    ["Total compensation ₱100,000, non-taxable ₱20,000. Taxable compensation?", ["₱20,000", "₱80,000", "₱100,000", "₱120,000"], 1, "₱100,000 − ₱20,000."],
    ["A refund of over-withheld tax from a previous month is an adjustment of:", ["Plus", "Minus (negative)", "Zero", "Double"], 1, "Reduces the taxes for remittance."],
    ["The ATC for compensation is:", ["WE010", "WW010", "II011", "WC158"], 1, "WW010."],
  ],
});
