// BIR Form 2316, September 2021 (ENCS): Certificate of Compensation Payment / Tax Withheld.
// Item numbers follow docs/bir-forms/2316-Sep-2021.pdf. Simplified: the minimum wage earner items (9, 10, 29 to 33) and Items 27 (PERA tax credit) are not simulated.
import { graduatedTax } from "../engine/tax";
import { f, fields, makeForm, opts, radio } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { caseOf, lessonOf, ymd } from "./kit";
import { RULES } from "../rules/2026";

const year = (v: Values) => (/^\d{4}$/.test(v["1"] ?? "") ? Number(v["1"]) : 0);
const TAXABLE: [string, string][] = [["39", "Basic Salary"], ["40", "Representation"], ["41", "Transportation"], ["42", "Cost of Living Allowance (COLA)"], ["43", "Fixed Housing Allowance"], ["44", "Others (specify)"], ["45", "Commission"], ["46", "Profit Sharing"], ["47", "Fees including Director's Fees"], ["48", "Taxable 13th Month Benefits"], ["49", "Hazard Pay"], ["50", "Overtime Pay"], ["51", "Others (specify)"]];

export const DEF = makeForm({
  id: "2316", number: "2316", title: "Certificate of Compensation Payment / Tax Withheld", subtitle: "For Compensation Payment With or Without Tax Withheld",
  version: "September 2021 (ENCS)", versionNote: "Official PDF: 2316 Sep 2021 ENCS (corrected). Issued by the employer to the employee; taught as due January 31 of the following year.",
  yearId: "1",
  identity: [
    fields(f("1", "1", "For the Year (YYYY)", "year", { span: 3, required: true }), f("2", "2", "For the Period From - To (MM/DD to MM/DD)", "text", { span: 5 })),
    fields(f("3", "3", "Employee's TIN", "tin", { span: 7, required: true }), f("5", "5", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("4", "4", "Employee's Name (Last Name, First Name, Middle Name)", "text", { span: 12, required: true })),
    fields(f("6", "6", "Registered Address", "text", { span: 9, required: true }), f("6A", "6A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("7", "7", "Date of Birth (MM/DD/YYYY)", "date", { span: 4 }), f("8", "8", "Contact Number", "phone", { span: 4 })),
    radio("11", "11", "Type of Employer (Part II)", opts(["main", "Main Employer"], ["secondary", "Secondary Employer"])),
    fields(f("12", "12", "Employer's TIN", "tin", { span: 7, required: true }), f("13", "13", "Employer's Name", "text", { span: 5, required: true })),
    fields(f("14", "14", "Employer's Registered Address", "text", { span: 9 }), f("14A", "14A", "ZIP Code", "zip", { span: 3 })),
  ],
  required: [{ id: "1" }, { id: "3" }, { id: "4" }, { id: "5" }, { id: "6" }, { id: "6A" }, { id: "11" }, { id: "12" }, { id: "13" }].map((r) => ({ ...r, message: `Item ${r.id} is required.` })),
  formats: { tin: ["3", "12"], rdo: ["5"], zip: ["6A", "14A"] },
  sections: [
    { id: "nt", title: "Part IV-B – A. Non-Taxable/Exempt Compensation Income", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "34", item: "34", label: "13th Month Pay and Other Benefits (maximum of P90,000)" },
      { id: "35", item: "35", label: "De Minimis Benefits" },
      { id: "36", item: "36", label: "SSS, GSIS, PHIC & PAG-IBIG Contributions and Union Dues (Employee share only)" },
      { id: "37", item: "37", label: "Salaries and Other Forms of Compensation (exempt)" },
      { id: "38", item: "38", label: "Total Non-Taxable/Exempt Compensation Income (Sum of Items 29 to 37)", f: (c) => c.n("34") + c.n("35") + c.n("36") + c.n("37"), bold: true, key: true },
    ] },
    { id: "tx", title: "Part IV-B – B. Taxable Compensation Income Regular", lines: [
      ...TAXABLE.map(([id, label]) => ({ id, item: id, label, specify: id === "44" || id === "51" })),
      { id: "52", item: "52", label: "Total Taxable Compensation Income (Sum of Items 39 to 51)", f: (c) => TAXABLE.reduce((a, [id]) => a + c.n(id), 0), bold: true, key: true },
    ] },
    { id: "sm", title: "Part IV-A – Summary", lines: [
      { id: "19", item: "19", label: "Gross Compensation Income from Present Employer (Sum of Items 38 and 52)", f: (c) => c.n("38") + c.n("52") },
      { id: "20", item: "20", label: "Less: Total Non-Taxable/Exempt Compensation Income from Present Employer (From Item 38)", f: (c) => c.n("38") },
      { id: "21", item: "21", label: "Taxable Compensation Income from Present Employer (Item 19 Less Item 20) (From Item 52)", f: (c) => c.n("19") - c.n("20") },
      { id: "22", item: "22", label: "Add: Taxable Compensation Income from Previous Employer, if applicable" },
      { id: "23", item: "23", label: "Gross Taxable Compensation Income (Sum of Items 21 and 22)", f: (c) => c.n("21") + c.n("22"), key: true },
      { id: "24", item: "24", label: "Tax Due (Item 23 x annual withholding tax table)", f: (c) => graduatedTax(c.n("23"), c.year || 2023), bold: true, key: true },
      { id: "25A", item: "25A", label: "Amount of Taxes Withheld: Present Employer" },
      { id: "25B", item: "25B", label: "Amount of Taxes Withheld: Previous Employer, if applicable" },
      { id: "26", item: "26", label: "Total Amount of Taxes Withheld as Adjusted (Sum of Items 25A and 25B)", f: (c) => c.n("25A") + c.n("25B"), bold: true, key: true },
    ] },
  ],
  due: (v) => (year(v) ? ymd(year(v) + 1, RULES.certificateDue.form2316Month, RULES.certificateDue.form2316Day) : ""),
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    if (Number(v["34A"]) > 90000) out.push({ id: "34A", item: "34", message: "13th month pay and other benefits are exempt up to P90,000 only; the excess goes to Item 48 (taxable 13th month benefits)." });
    if (Number(v["44A"]) > 0 && !(v["44S"] ?? "").trim()) out.push({ id: "44S", item: "44", message: "Specify what Item 44 is." });
    return out;
  },
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string): Values => ({ "3": `000-000-${n}-00000`, "5": rdo, "4": name, "6": addr, "6A": zip, "7": "03/10/1990", "8": `0917000${n}`, "11": "main", "12": "000-111-222-00000", "13": "NUEVA ECIJA SCHOOL SUPPLY CORP.", "14": "POBLACION, CABANATUAN CITY, NUEVA ECIJA", "14A": "3100" });
const common = { "1": "2025", "2": "0101 TO 1231" } as const;

export const CASES = [
  caseOf({
    form: "2316", level: "easy", year: 2025, title: "A clerk's certificate for 2025",
    story: ["You are the payroll officer of Nueva Ecija School Supply Corp. Prepare the 2316 for Mark R. Bautista, a rank-and-file clerk (Barangay Sumacab Sur, Cabanatuan City 3100), a single employee with this employer for the whole of 2025.", "Basic salary ₱420,000. 13th month pay ₱35,000 and de minimis benefits ₱5,000 (both exempt), and employee contributions to SSS, PhilHealth and Pag-IBIG of ₱28,000. Tax withheld during the year: ₱26,500.", "Fill in the Form 2316 for the year 2025 (issue it by January 31, 2026)."],
    profile: P(901, "025", "BAUTISTA, MARK, REYES", "BRGY. SUMACAB SUR, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "39A": "420000", "34A": "35000", "35A": "5000", "36A": "28000", "25AA": "26500" },
    filing: "2026-01-25",
    why: "The employer certifies compensation and tax withheld to the employee with Form 2316.",
    hints: ["Exempt items (34 to 37) add up in Item 38; taxable items (39 to 51) in Item 52.", "Item 24 uses the annual tax table (Table 2 for 2025) on Item 23.", "Item 26 totals the taxes withheld."],
    solution: ["Non-taxable (Item 38) = ₱35,000 + ₱5,000 + ₱28,000 = ₱68,000. Taxable (Item 52) = ₱420,000.", "Gross compensation (Item 19) = ₱488,000; taxable compensation (Items 21, 23) = ₱420,000.", "Tax due (Item 24) = ₱22,500 + 20% × ₱20,000 = ₱26,500. Withheld (Item 26) = ₱26,500: no difference."],
  }),
  caseOf({
    form: "2316", level: "average", year: 2025, title: "A 13th month pay above ₱90,000, under-withheld",
    story: ["Prepare the 2316 for Grace L. Tolentino, a supervisor (Barangay Caanawan, San Jose City 3121), employed all of 2025. Basic salary ₱600,000; transportation allowance ₱24,000 (taxable); 13th month pay and other benefits ₱120,000; employee contributions ₱40,000.", "Only ₱90,000 of the 13th month pay and other benefits is exempt (Item 34); the ₱30,000 excess is a taxable 13th month benefit (Item 48). Tax withheld during the year: ₱70,000.", "Fill in the Form 2316 for 2025."],
    profile: P(902, "026", "TOLENTINO, GRACE, LAZARO", "BRGY. CAANAWAN, SAN JOSE CITY, NUEVA ECIJA", "3121"),
    facts: { ...common, "39A": "600000", "41A": "24000", "34A": "90000", "48A": "30000", "36A": "40000", "25AA": "70000" },
    filing: "2026-01-28",
    why: "The employer certifies compensation and tax withheld with Form 2316.",
    hints: ["Split the 13th month pay: ₱90,000 exempt, the excess taxable.", "Contributions are exempt in Item 36.", "Compare Item 24 with Item 26 to see whether tax was under-withheld."],
    solution: ["Non-taxable (Item 38) = ₱90,000 + ₱40,000 = ₱130,000. Taxable (Item 52) = ₱600,000 + ₱24,000 + ₱30,000 = ₱654,000.", "Gross compensation (Item 19) = ₱784,000. Taxable compensation (Item 23) = ₱654,000. Tax due (Item 24) = ₱22,500 + 20% × ₱254,000 = ₱73,300.", "Withheld (Item 26) = ₱70,000, so ₱3,300 was under-withheld and must be settled by the employee's year-end adjustment or return."],
  }),
  caseOf({
    form: "2316", level: "difficult", year: 2025, title: "A change of employer during 2025",
    story: ["Prepare the 2316 of Ramon C. Dizon (Barangay Pinagpanaan, Gapan City 3105), who joined your company mid-year. From his previous employer he gave you a 2316: taxable compensation ₱150,000 and tax withheld ₱8,000.", "With you (present employer): basic salary ₱480,000; commission ₱60,000; overtime pay ₱20,000; 13th month pay and other benefits ₱100,000 (₱90,000 exempt; ₱10,000 taxable under Item 48); de minimis benefits ₱8,000; employee contributions ₱30,000. Tax you withheld: ₱70,000.", "Fill in the Form 2316 for 2025, including the previous employer's data."],
    profile: P(903, "027", "DIZON, RAMON, CRUZ", "BRGY. PINAGPANAAN, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "39A": "480000", "45A": "60000", "50A": "20000", "48A": "10000", "34A": "90000", "35A": "8000", "36A": "30000", "22A": "150000", "25AA": "70000", "25BA": "8000" },
    filing: "2026-01-30",
    why: "The present employer certifies the whole year's compensation and tax, including the previous employer's data, with Form 2316.",
    hints: ["Taxable compensation from the previous employer goes to Item 22.", "The tax due is computed on the COMBINED taxable compensation.", "Item 26 adds both employers' withholdings."],
    solution: ["Non-taxable (Item 38) = ₱90,000 + ₱8,000 + ₱30,000 = ₱128,000. Taxable with you (Item 52) = ₱480,000 + ₱60,000 + ₱20,000 + ₱10,000 = ₱570,000.", "Gross taxable (Item 23) = ₱570,000 + ₱150,000 = ₱720,000. Tax due (Item 24) = ₱22,500 + 20% × ₱320,000 = ₱86,500.", "Withheld (Item 26) = ₱70,000 + ₱8,000 = ₱78,000; ₱8,500 under-withheld."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 2316: Certificate of Compensation Payment / Tax Withheld", minutes: "About 6 minutes",
  sections: [
    ["1. What the certificate is", "The employer gives each employee a Form 2316 after the close of the year (taught as by January 31). It shows the employee's compensation, the exempt part, the taxable part, the tax due on the year's taxable compensation and the tax actually withheld. The employee attaches it to the annual return (1700 or 1701) or, if the employer's certificate qualifies for substituted filing, it serves in place of the return. The employer reports the withholdings in the annual information return 1604-C."],
    ["2. Exempt and taxable compensation", "Part IV-B A lists the exempt items: 13th month pay and other benefits up to ₱90,000, de minimis benefits, employee contributions to SSS/GSIS, PhilHealth and Pag-IBIG and union dues, and (for minimum wage earners) the statutory minimum wage items. Part IV-B B lists the taxable items: basic salary, allowances, commissions, overtime, fees, and any 13th month benefits above ₱90,000. The summary (Part IV-A) adds exempt and taxable to get gross compensation (Item 19), takes the taxable amount, adds taxable compensation from a previous employer (Item 22), and computes the tax due on the total with the annual table (Item 24). The tax withheld by both employers is compared with it."],
    ["3. Why the numbers matter", "If the tax withheld is less than the tax due the employee is under-withheld and owes the difference; if more, the employer refunds the over-withholding. When an employee has two employers in a year, neither can complete substituted filing and the employee files Form 1700."],
  ],
  worked: { intro: "An employee earns ₱420,000 basic salary, has ₱68,000 of exempt compensation, and ₱26,500 was withheld.", steps: ["Taxable = ₱420,000; tax due = ₱22,500 + 20% × ₱20,000 = ₱26,500.", "Withheld ₱26,500 equals the tax due."], title: "Form 2316", table: { "38": "68,000", "52": "420,000", "23": "420,000", "24": "26,500", "26": "26,500" } },
  legal: ["NIRC Sec. 24(A), Sec. 32(B)(7)(e) (13th month and other benefits exempt up to ₱90,000), Sec. 79 (withholding on compensation), RR 2-98 as amended; BIR Form 2316 (September 2021 ENCS)."],
  guide: [
    ["1 to 8", "1", "Year, period, employee TIN, name, RDO, address, birth date, contact.", "Employee records.", "Wrong TIN format."],
    ["11 to 14", "11", "Employer type (main/secondary), TIN, name and address.", "Employer records.", "Both main and secondary."],
    ["34 to 37", "34A", "Exempt: 13th month and other benefits (max ₱90,000), de minimis, contributions, others.", "Payroll.", "More than ₱90,000 in Item 34."],
    ["38", "38", "Computed total exempt.", "Computed.", "Typing it."],
    ["39 to 51", "39A", "Taxable items: basic salary, allowances, commission, overtime and others.", "Payroll.", "13th month excess missed."],
    ["52, 19 to 23", "52", "Computed totals; Item 22 is the previous employer's taxable compensation.", "Previous 2316.", "Omitting Item 22."],
    ["24, 25A, 25B, 26", "24", "Computed tax due; taxes withheld by present and previous employers; total.", "Payroll, previous 2316.", "Comparing the wrong figures."],
  ],
  checklist: ["Get payroll for all 12 months.", "Split the 13th month and other benefits at ₱90,000.", "Ask the new employee for the previous 2316.", "Issue by January 31."],
  pitfalls: ["Exempting the whole 13th month.", "Leaving out the previous employer.", "Wrong year's tax table.", "Treating contributions as taxable."],
  amended: "A corrected certificate is issued when figures change; keep the original for reference.",
  noPayment: "A certificate is not a return and no payment is made with it.",
  quiz: [
    ["13th month and other benefits of ₱130,000. Exempt part?", ["₱130,000", "₱90,000", "₱40,000", "₱0"], 1, "The exempt ceiling is ₱90,000; the excess is taxable."],
    ["Item 22 is for:", ["Tax withheld", "Taxable compensation from a previous employer", "Allowances", "Contributions"], 1, "Add taxable compensation from previous employer, if applicable."],
    ["Taxable compensation ₱300,000. Tax due (Table 2)?", ["₱7,500", "₱15,000", "₱22,500", "₱0"], 0, "15% × (₱300,000 − ₱250,000) = ₱7,500."],
    ["Who prepares Form 2316?", ["The employee", "The employer", "The BIR", "The bank"], 1, "The employer certifies compensation and tax withheld."],
    ["Withheld ₱70,000, tax due ₱73,300. The employee is:", ["Over-withheld", "Under-withheld", "Exact", "Exempt"], 1, "Less tax was withheld than due."],
  ],
});
