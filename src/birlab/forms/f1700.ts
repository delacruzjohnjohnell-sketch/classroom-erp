// BIR Form 1700, January 2018 (ENCS): Annual Income Tax Return, Individuals Earning Purely Compensation Income.
// Item numbers and labels follow docs/bir-forms/1700-Jan-2018-ENCS-v6.pdf. Schedule 1 is shortened to two employers (rows S1 and S2).
import { RULES } from "../rules/2026";
import { amt, annualReturnDue, graduatedTax, roundToPeso } from "../engine/tax";
import { f, fields, makeForm, opts, radio, yes, type RowSpec } from "./kit";
import type { Values } from "./types";

const joint = (v: Values) => v["17"] === "joint";
const grad = (c: { text: (id: string) => string }) => c.text("6") !== "nranetb";
const flat = (c: { text: (id: string) => string }) => c.text("6") === "nranetb";

const sched = (n: 1 | 2): RowSpec[] => [
  { id: `S${n}c`, item: `Sch. 1-${n}c`, label: `Employer ${n}: c. Compensation income subject to regular/graduated rates` },
  { id: `S${n}d`, item: `Sch. 1-${n}d`, label: `Employer ${n}: d. Compensation income subject to 25% flat rate` },
  { id: `S${n}e`, item: `Sch. 1-${n}e`, label: `Employer ${n}: e. Tax withheld` },
];

export const F1700 = makeForm({
  id: "1700", number: "1700", title: "Annual Income Tax Return", subtitle: "Individuals Earning Purely Compensation Income (Including Non-Business/Non-Profession Income)",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 1700 Jan 2018 ENCS v6. Due date: April 15 (stated on the BIR forms page for 1700).",
  spouse: joint,
  identity: [
    fields(f("1", "1", "For the Year (YYYY)", "year", { span: 3, required: true }), f("2", "2", "Amended Return?", "yesno", { span: 3, required: true }), f("3", "3", "Alphanumeric Tax Code (ATC)", "radio", { span: 6, options: opts(["II011", "II011 Compensation Income"]), required: true })),
    fields(f("4", "4", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("5", "5", "RDO Code", "rdo", { span: 5, required: true })),
    radio("6", "6", "Taxpayer Type", opts(["employee", "Employee (Regular Rates)"], ["nranetb", "NRANETB* (25%)"])),
    fields(f("7", "7", "Taxpayer's Name (Last Name, First Name, Middle Name)", "text", { span: 12, required: true })),
    fields(f("8", "8", "Registered Address", "text", { span: 9, required: true }), f("8A", "8A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("9", "9", "Date of Birth (MM/DD/YYYY)", "date", { span: 4 }), f("10", "10", "Email Address", "email", { span: 8 })),
    fields(f("11", "11", "Citizenship", "text", { span: 4, required: true }), yes("12", "12", "Claiming Foreign Tax Credits?"), f("13", "13", "Foreign Tax Number, if applicable", "text", { span: 4 })),
    fields(f("14", "14", "Contact Number (Landline/Cellphone No.)", "phone", { span: 6 })),
    radio("15", "15", "Civil Status", opts(["single", "Single"], ["married", "Married"], ["separated", "Legally Separated"], ["widow", "Widow/er"])),
    fields(yes("16", "16", "If married, spouse has income?", 6), f("17", "17", "Filing Status", "radio", { span: 6, options: opts(["joint", "Joint Filing"], ["separate", "Separate Filing"]) })),
    fields(f("18", "18", "Spouse's TIN", "tin", { span: 7 }), f("19", "19", "Spouse's RDO Code", "rdo", { span: 5 })),
    fields(f("20", "20", "Spouse's Taxpayer Type", "radio", { span: 12, options: opts(["employee", "Employee (Regular Rates)"], ["nranetb", "NRANETB* (25%)"]) })),
    fields(f("21", "21", "Spouse's Name (Last Name, First Name, Middle Name)", "text", { span: 12 })),
    fields(f("37", "37", "Number of Attachments", "count", { span: 3, required: true })),
  ],
  required: [{ id: "1", message: "Enter the taxable year (YYYY)." }, { id: "2", message: "Choose Yes or No." }, { id: "3", message: "Choose the ATC." }, { id: "4", message: "Enter the TIN." }, { id: "5", message: "Enter the RDO code." }, { id: "6", message: "Choose the taxpayer type." }, { id: "7", message: "Enter the taxpayer's name." }, { id: "8", message: "Enter the registered address." }, { id: "8A", message: "Enter the ZIP code." }, { id: "11", message: "Enter the citizenship." }, { id: "12", message: "Choose Yes or No." }, { id: "15", message: "Choose the civil status." }, { id: "37", message: "Enter the number of attachments (0 if none)." }],
  formats: { tin: ["4", "18"], rdo: ["5", "19"], zip: ["8A"], email: ["10"] },
  sections: [
    { id: "part3", title: "Part III – Total Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "26", item: "26", label: "Tax Due (Either from Part V.A Item 47A/B OR Part V.B 53A/B)", f: (c) => (flat({ text: c.text }) ? c.n("53") : c.n("47")) },
      { id: "27", item: "27", label: "Less: Total Tax Credits/Payments (From Part V.C Item 58A/B)", f: (c) => c.n("58") },
      { id: "28", item: "28", label: "Net Tax Payable/(Overpayment) (Item 26 Less Item 27)", f: (c) => c.n("26") - c.n("27"), bold: true, key: true },
      { id: "29", item: "29", label: "Less: Portion of Tax Payable Allowed for 2nd Installment to be paid on or before October 15 (50% or less of Item 26) (applicable only to employee subject to regular IT rates)" },
      { id: "30", item: "30", label: "Amount of Tax Payable/(Overpayment) (Item 28 Less Item 29)", f: (c) => c.n("28") - c.n("29"), bold: true },
      { heading: "Add: Penalties" },
      { id: "31", item: "31", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "32", item: "32", label: "Interest", f: () => 0, indent: 1 },
      { id: "33", item: "33", label: "Compromise", indent: 1 },
      { id: "34", item: "34", label: "Total Penalties (Sum of Items 31 to 33)", f: () => 0 },
      { id: "35", item: "35", label: "Total Amount Payable/(Overpayment) (Sum of Items 30 and 34)", f: () => 0, bold: true, key: true },
    ] },
    { id: "partV", title: "Part V – Computation of Tax", note: "If subject to graduated rates, fill in items 42 to 47; if subject to 25%, fill in items 48 to 53.", lines: [
      { heading: "Part V.A – Subject to Graduated Rates" },
      { id: "42", item: "42", label: "Gross Compensation Income (From Schedule 1 Item 5Ac/5Bc)", f: (c) => c.n("S5c"), when: grad },
      { id: "43", item: "43", label: "Less: Non-Taxable / Exempt Compensation" },
      { id: "44", item: "44", label: "Gross Taxable Compensation Income (Item 42 Less Item 43)", f: (c) => c.n("42") - c.n("43"), when: grad },
      { id: "45", item: "45", label: "Add: Other Taxable Non-Business/Non-Profession Income (specify)", specify: true },
      { id: "46", item: "46", label: "Total Taxable Income (Sum of Items 44 and 45)", f: (c) => c.n("44") + c.n("45"), when: grad },
      { id: "47", item: "47", label: "Tax Due [Item 46 x Applicable Income Tax Rate (refer to tax table below)] (To Part III Item 26)", f: (c) => graduatedTax(c.n("46"), c.year || 2023), when: grad, bold: true, key: true },
      { heading: "Part V.B – Subject to 25% Flat Rate for NRANETB" },
      { id: "48", item: "48", label: "Gross Compensation Income (From Schedule 1 Item 5Ad/5Bd)", f: (c) => c.n("S5d"), when: flat },
      { id: "49", item: "49", label: "Less: Non-Taxable/Exempt Compensation (please specify)", specify: true },
      { id: "50", item: "50", label: "Gross Taxable Compensation Income (Item 48 Less Item 49)", f: (c) => c.n("48") - c.n("49"), when: flat },
      { id: "51", item: "51", label: "Add: Other Taxable Income (please specify)", specify: true },
      { id: "52", item: "52", label: "Total Taxable Income (Sum of Items 50 and 51)", f: (c) => c.n("50") + c.n("51"), when: flat },
      { id: "53", item: "53", label: "Tax Due (Item 52 x 25% Flat Rate) (To Part III Item 26)", f: (c) => roundToPeso(Math.round(Math.max(c.n("52"), 0) * RULES.compensation.flatRateNranetb)), when: flat, bold: true, key: true },
      { heading: "Part V.C – Tax Credits/Payments (attach proof)" },
      { id: "54", item: "54", label: "Tax Withheld per BIR Form No. 2316, if applicable (From Schedule 1 Item 5Ae/5Be)", f: (c) => c.n("S5e") },
      { id: "55", item: "55", label: "Tax Paid in Return Previously Filed, if this is an Amended Return" },
      { id: "56", item: "56", label: "Foreign Tax Credits, if applicable" },
      { id: "57", item: "57", label: "Other Tax Credits/Payments (specify)", specify: true },
      { id: "58", item: "58", label: "Total Tax Credits/Payments (Sum of Items 54 to 57) (To Part III Item 27)", f: (c) => c.n("54") + c.n("55") + c.n("56") + c.n("57"), bold: true },
      { id: "59", item: "59", label: "Net Tax Payable/(Overpayment) (Either Item 47 OR Item 53 Less Item 58) (To Part III Item 28)", f: (c) => c.n("26") - c.n("58"), bold: true, key: true },
    ] },
    { id: "sch1", title: "Part VI – Schedule 1: Gross Compensation Income and Tax Withheld", note: "Enter the compensation and tax withheld for each employer (Taxpayer in column A, Spouse in column B). Items 5Ac to 5Ae are the totals.", lines: [
      ...sched(1), ...sched(2),
      { id: "S5c", item: "Sch. 1-5c", label: "Total compensation income subject to regular/graduated rates (To Part V Item 42)", f: (c) => c.n("S1c") + c.n("S2c"), bold: true },
      { id: "S5d", item: "Sch. 1-5d", label: "Total compensation income subject to 25% flat rate (To Part V Item 48)", f: (c) => c.n("S1d") + c.n("S2d"), bold: true },
      { id: "S5e", item: "Sch. 1-5e", label: "Total tax withheld (To Part V Item 54)", f: (c) => c.n("S1e") + c.n("S2e"), bold: true },
    ] },
  ],
  split: 1,
  penalty: { base: "30", surcharge: "31", interest: "32", compromise: "33", total: "34", grand: "35", gross: () => 25_000_000_00 },
  due: (v) => (/^\d{4}$/.test(v["1"] ?? "") ? annualReturnDue(Number(v["1"])) : ""),
  extraValidate: (v, _ctx, computed) => {
    const out = [];
    for (const col of joint(v) ? ["A", "B"] : ["A"]) {
      const due = amt(computed["26" + col]);
      if (amt(v["29" + col]) > 0 && (v["6"] === "nranetb" || amt(v["29" + col]) > due / 2)) out.push({ id: "29" + col, item: "29", message: "The second installment is only for employees under regular rates, and may not exceed 50% of Item 26." });
    }
    if (v["2"] === "yes" && amt(v["55A"]) <= 0) out.push({ id: "55A", item: "55", message: "This is an amended return: enter the tax paid in the return previously filed (Item 55)." });
    if (v["17"] === "joint" && !v["18"]) out.push({ id: "18", item: "18", message: "A joint return needs the spouse's TIN (Item 18)." });
    return out;
  },
  scoreExtra: [{ id: "6", weight: 2 }],
});
