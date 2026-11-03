// BIR Form 1701, January 2018 (ENCS): Annual Income Tax Return, Individuals (including MIXED Income Earner), Estates and Trusts.
// Item numbers follow docs/bir-forms/1701-Jan-2018.pdf. Because the printed form reuses item numbers across its parts, value ids are prefixed:
// pNN = Part II, sNN = Schedule items, s4_N = Schedule 4 lines, vN = Part VI, cN = Part VII, spN = Part IV (spouse). Simplified: Parts VIII to X (special/exempt
// regimes, tax relief, reconciliation) and the detail of Schedules 5 and 6 are not simulated; Items 14 and 15 are typed as totals.
import { RULES } from "../rules/2026";
import { annualReturnDue, eightPercentTax, graduatedTax, optionalStandardDeduction } from "../engine/tax";
import { f, fields, makeForm, opts, radio, yes, type Line, type RowSpec } from "./kit";
import type { Issue, Values } from "./types";

const joint = (v: Values) => v["18"] === "joint";
const isGrad = (c: { text: (id: string) => string }) => c.text("21") === "graduated";
const isEight = (c: { text: (id: string) => string }) => c.text("21") === "eight";
const ATC = opts(["II012", "II012 Business Income - Graduated IT Rates"], ["II014", "II014 Income from Profession - Graduated IT Rates"], ["II013", "II013 Mixed Income - Graduated IT Rates"], ["II011", "II011 Compensation Income"], ["II015", "II015 Business Income - 8% IT Rate"], ["II017", "II017 Income from Profession - 8% IT Rate"], ["II016", "II016 Mixed Income - 8% IT Rate"]);

const S4 = ["Amortizations", "Bad Debts", "Charitable and Other Contributions", "Depletion", "Depreciation", "Entertainment, Amusement and Recreation", "Fringe Benefits", "Interest", "Losses", "Pension Trusts", "Rental", "Research and Development", "Salaries, Wages and Allowances", "SSS, GSIS, Philhealth, HDMF and Other Contributions", "Taxes and Licenses", "Transportation and Travel", "Others (Deductions Subject to Withholding Tax and Other Expenses)"];
const schedule4: Line[] = [
  ...S4.map((label, i): RowSpec => ({ id: `s4_${i + 1}`, item: `Sch.4-${i + 1}`, label, specify: i === 16 })),
  { id: "s4_18", item: "Sch.4-18", label: "Total Ordinary Allowable Itemized Deductions (Sum of Items 1 to 17) (To Schedule 3.A Item 13)", f: (c) => Array.from({ length: 17 }, (_, i) => c.n(`s4_${i + 1}`)).reduce((a, b) => a + b, 0), bold: true },
];

const REQUIRED = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "9A", "12", "13", "16", "19", "20", "21", "33"];

export const F1701 = makeForm({
  id: "1701", number: "1701", title: "Annual Income Tax Return", subtitle: "Individuals (including MIXED Income Earner), Estates and Trusts",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 1701 Jan 2018 final with rates. Due date April 15 (stated on the BIR forms page for 1701).",
  spouse: joint, yearId: "1",
  identity: [
    fields(f("1", "1", "For the Year (YYYY)", "year", { span: 3, required: true }), yes("2", "2", "Amended Return?", 3), yes("3", "3", "Short Period Return?", 3)),
    fields(f("4", "4", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("5", "5", "RDO Code", "rdo", { span: 5, required: true })),
    radio("6", "6", "Taxpayer Type", opts(["single", "Single Proprietor"], ["professional", "Professional"], ["estate", "Estate"], ["trust", "Trust"], ["compensation", "Compensation Earner"])),
    radio("7", "7", "Alphanumeric Tax Code (ATC)", ATC),
    fields(f("8", "8", "Taxpayer's Name (Last Name, First Name, Middle Name) / ESTATE OF / TRUST FAO", "text", { span: 12, required: true })),
    fields(f("9", "9", "Registered Address", "text", { span: 9, required: true }), f("9A", "9A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("10", "10", "Date of Birth (MM/DD/YYYY)", "date", { span: 4 }), f("11", "11", "Email Address", "email", { span: 8 })),
    fields(f("12", "12", "Citizenship", "text", { span: 4, required: true }), yes("13", "13", "Claiming Foreign Tax Credits?"), f("14", "14", "Foreign Tax Number, if applicable", "text", { span: 4 })),
    fields(f("15", "15", "Contact Number (Landline/Cellphone No.)", "phone", { span: 6 })),
    radio("16", "16", "Civil Status (if applicable)", opts(["single", "Single"], ["married", "Married"], ["separated", "Legally Separated"], ["widow", "Widow/er"])),
    fields(yes("17", "17", "If married, spouse has income?", 6), f("18", "18", "Filing Status", "radio", { span: 6, options: opts(["joint", "Joint Filing"], ["separate", "Separate Filing"]) })),
    fields(yes("19", "19", "Income EXEMPT from Income Tax?", 6), yes("20", "20", "Income subject to SPECIAL/PREFERENTIAL RATE?", 6)),
    radio("21", "21", "Tax Rate (choose one)", opts(["graduated", "Graduated Rates (choose the method of deduction in Item 21A)"], ["eight", "8% in lieu of Graduated Rates under Sec. 24(A) & Percentage Tax under Sec. 116 [available if gross sales/receipts and other non-operating income do not exceed P3M]"])),
    fields(f("21A", "21A", "Method of Deduction (choose one)", "radio", { span: 12, options: opts(["itemized", "Itemized Deduction [Sec. 34(A-J), NIRC]"], ["osd", "Optional Standard Deduction (OSD) [40% of Gross Sales/Receipts/Revenues/Fees, Sec. 34(L), NIRC]"]) })),
    fields(f("sp1", "Part IV-1", "Spouse's TIN (Part IV, only if the spouse is covered)", "tin", { span: 7 }), f("sp2", "Part IV-2", "Spouse's RDO Code", "rdo", { span: 5 })),
    fields(f("sp3", "Part IV-3", "Filer's Spouse Type", "radio", { span: 12, options: opts(["single", "Single Proprietor"], ["professional", "Professional"], ["compensation", "Compensation Earner"]) })),
    fields(f("sp5", "Part IV-5", "Spouse's Name (Last Name, First Name, Middle Name)", "text", { span: 12 })),
    fields(f("33", "33", "Number of Attachments", "count", { span: 3, required: true })),
    fields(f("OV", "Overpayment", "If overpayment, mark one box only (irrevocable)", "radio", { span: 12, options: opts(["refund", "To be refunded"], ["tcc", "To be issued a Tax Credit Certificate (TCC)"], ["carry", "To be carried over as a tax credit for next year/quarter"]) })),
  ],
  required: REQUIRED.map((id) => ({ id, message: id === "33" ? "Enter the number of attachments (0 if none)." : `Item ${id} is required.` })),
  formats: { tin: ["4", "sp1"], rdo: ["5", "sp2"], zip: ["9A"], email: ["11"] },
  sections: [
    { id: "part2", title: "Part II – Total Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "p22", item: "22", label: "Tax Due (From Part VI Item 5)", f: (c) => c.n("v5") },
      { id: "p23", item: "23", label: "Less: Total Tax Credits/Payments (From Part VII Item 10)", f: (c) => c.n("c10") },
      { id: "p24", item: "24", label: "Tax Payable/(Overpayment) (Item 22 Less Item 23)", f: (c) => c.n("p22") - c.n("p23"), bold: true, key: true },
      { id: "p25", item: "25", label: "Less: Portion of Tax Payable Allowed for 2nd Installment to be paid on or before October 15 (50% or less of Item 22)" },
      { id: "p26", item: "26", label: "Amount of Tax Payable/(Overpayment) (Item 24 Less Item 25)", f: (c) => c.n("p24") - c.n("p25"), bold: true },
      { heading: "Add: Penalties" },
      { id: "p27", item: "27", label: "Interest", f: () => 0, indent: 1 },
      { id: "p28", item: "28", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "p29", item: "29", label: "Compromise", indent: 1 },
      { id: "p30", item: "30", label: "Total Penalties (Sum of Items 27 to 29)", f: () => 0 },
      { id: "p31", item: "31", label: "Total Amount Payable/(Overpayment) (Sum of Items 26 and 30)", f: () => 0, bold: true, key: true },
    ] },
    { id: "sch1", title: "Part V – Schedule 1: Gross Compensation Income and Tax Withheld", note: "One line per employer: c. compensation income, d. tax withheld. Item 3 is the total (column A taxpayer, column B spouse).", lines: [
      { id: "s1c1", item: "Sch.1-1c", label: "Employer 1: c. Compensation income" }, { id: "s1d1", item: "Sch.1-1d", label: "Employer 1: d. Tax withheld" },
      { id: "s1c2", item: "Sch.1-2c", label: "Employer 2: c. Compensation income" }, { id: "s1d2", item: "Sch.1-2d", label: "Employer 2: d. Tax withheld" },
      { id: "s3c", item: "Sch.1-3c", label: "Total gross compensation income (To Schedule 2 Item 4)", f: (c) => c.n("s1c1") + c.n("s1c2"), bold: true },
      { id: "s3d", item: "Sch.1-3d", label: "Total tax withheld (To Part VII Item 5)", f: (c) => c.n("s1d1") + c.n("s1d2"), bold: true },
    ] },
    { id: "sch2", title: "Schedule 2 – Taxable Compensation Income", lines: [
      { id: "s4", item: "4", label: "Gross Compensation Income (From Schedule 1 Item 3c)", f: (c) => c.n("s3c") },
      { id: "s5", item: "5", label: "Less: Non-Taxable / Exempt Compensation" },
      { id: "s6", item: "6", label: "Taxable Compensation Income (Item 4 Less Item 5)", f: (c) => c.n("s4") - c.n("s5"), key: true },
      { id: "s7", item: "7", label: "Tax Due-Compensation Income (Item 6 x applicable Income Tax Rate)", f: (c) => graduatedTax(c.n("s6"), c.year || 2023) },
    ] },
    { id: "sch3a", title: "Schedule 3.A – For Graduated Income Tax Rates", note: "If graduated rates, fill in Items 8 to 25; if the 8% flat rate, fill in Items 26 to 32.", lines: [
      { id: "s8", item: "8", label: "Sales/Revenues/Receipts/Fees" },
      { id: "s9", item: "9", label: "Less: Sales Returns, Allowances and Discounts" },
      { id: "s10", item: "10", label: "Net Sales/Revenues/Receipts/Fees (Item 8 Less Item 9)", f: (c) => c.n("s8") - c.n("s9"), when: isGrad },
      { id: "s11", item: "11", label: "Less: Cost of Sales/Services (applicable only if availing Itemized Deductions)" },
      { id: "s12", item: "12", label: "Gross Income/(Loss) from Operation (Item 10 Less Item 11)", f: (c) => c.n("s10") - c.n("s11"), when: isGrad },
      { heading: "Less: Deductions Allowable under Existing Laws" },
      { id: "s13", item: "13", label: "Ordinary Allowable Itemized Deductions (From Schedule 4 Item 18)", f: (c) => c.n("s4_18"), when: isGrad },
      { id: "s14", item: "14", label: "Special Allowable Itemized Deductions (From Schedule 5 total)" },
      { id: "s15", item: "15", label: "Allowance for Net Operating Loss Carry Over (NOLCO) (From Schedule 6 total)" },
      { id: "s16", item: "16", label: "Total Allowable Itemized Deductions (Sum of Items 13 to 15)", f: (c) => (c.text("21A") === "itemized" ? c.n("s13") + c.n("s14") + c.n("s15") : 0), when: isGrad },
      { id: "s17", item: "17", label: "OR Optional Standard Deduction (OSD) (40% of Item 10)", f: (c) => (c.text("21A") === "osd" ? optionalStandardDeduction(c.n("s10")) : 0), when: isGrad },
      { id: "s18", item: "18", label: "Net Income/(Loss) (If Itemized: Item 12 Less Item 16; If OSD: Item 10 Less Item 17)", f: (c) => (c.text("21A") === "osd" ? c.n("s10") - c.n("s17") : c.n("s12") - c.n("s16")), when: isGrad, key: true },
      { heading: "Add: Other Non-Operating Income (specify below)" },
      { id: "s19", item: "19", label: "Other non-operating income (1)", specify: true, indent: 1 },
      { id: "s20", item: "20", label: "Other non-operating income (2)", specify: true, indent: 1 },
      { id: "s21", item: "21", label: "Amount Received/Share in Income by a Partner from General Professional Partnership (GPP)", indent: 1 },
      { id: "s22", item: "22", label: "Total Other Non-Operating Income (Sum of Items 19 to 21)", f: (c) => c.n("s19") + c.n("s20") + c.n("s21"), when: isGrad },
      { id: "s23", item: "23", label: "Taxable Income-Business (Sum of Items 18 and 22)", f: (c) => c.n("s18") + c.n("s22"), when: isGrad },
      { id: "s24", item: "24", label: "Total Taxable Income - Compensation & Business (Sum of Items 6 and 23)", f: (c) => c.n("s6") + c.n("s23"), when: isGrad, key: true },
      { id: "s25", item: "25", label: "Total Tax Due-Compensation and Business Income (under graduated rates) (To Part VI Item 1)", f: (c) => graduatedTax(c.n("s24"), c.year || 2023), when: isGrad, bold: true, key: true },
    ] },
    { id: "sch3b", title: "Schedule 3.B – For 8% Flat Income Tax Rate", lines: [
      { id: "s26", item: "26", label: "Sales/Revenues/Receipts/Fees (net of sales returns, allowances and discounts)" },
      { id: "s27", item: "27", label: "Add: Other Non-Operating Income (specify)", specify: true },
      { id: "s28", item: "28", label: "Total Income (Sum of Items 26 and 27)", f: (c) => c.n("s26") + c.n("s27"), when: isEight },
      { id: "s29", item: "29", label: "Less: Allowable reduction of P250,000 (not applicable if with compensation income)", f: (c) => (c.n("s4") > 0 ? 0 : RULES.eightPercent.reduction * 100), when: isEight },
      { id: "s30", item: "30", label: "Taxable Income/(Loss) (Item 28 Less Item 29)", f: (c) => c.n("s28") - c.n("s29"), when: isEight },
      { id: "s31", item: "31", label: "Tax Due-Business Income (Item 30 x 8% Flat Income Tax Rate)", f: (c) => eightPercentTax(c.n("s30")), when: isEight },
      { id: "s32", item: "32", label: "Total Tax Due-Compensation & Business Income (under flat rate) (Sum of Items 7 and 31) (To Part VI Item 1)", f: (c) => c.n("s7") + c.n("s31"), when: isEight, bold: true, key: true },
    ] },
    { id: "sch4", title: "Schedule 4 – Ordinary Allowable Itemized Deductions", lines: schedule4 },
    { id: "part6", title: "Part VI – Summary of Income Tax Due", lines: [
      { id: "v1", item: "VI-1", label: "Regular Rate-Income Tax Due (From Part V, Either Item 25 or Item 32)", f: (c) => (isEight(c) ? c.n("s32") : c.n("s25")) },
      { id: "v5", item: "VI-5", label: "Total Income Tax Due (Sum of Items 1 and 4; special rates are not simulated) (To Part II Item 22)", f: (c) => c.n("v1"), bold: true },
    ] },
    { id: "part7", title: "Part VII – Tax Credits/Payments (attach proof)", lines: [
      { id: "c1", item: "VII-1", label: "Prior Year's Excess Credits" },
      { id: "c2", item: "VII-2", label: "Tax Payments for the First Three (3) Quarters" },
      { id: "c3", item: "VII-3", label: "Creditable Tax Withheld for the First Three (3) Quarters" },
      { id: "c4", item: "VII-4", label: "Creditable Tax Withheld per BIR Form No. 2307 for the 4th Quarter" },
      { id: "c5", item: "VII-5", label: "Creditable Tax Withheld per BIR Form No. 2316 (From Schedule 1 Item 3d)", f: (c) => c.n("s3d") },
      { id: "c6", item: "VII-6", label: "Tax Paid in Return Previously Filed, if this is an Amended Return" },
      { id: "c7", item: "VII-7", label: "Foreign Tax Credits, if applicable" },
      { id: "c9", item: "VII-9", label: "Other Tax Credits/Payments (specify)", specify: true },
      { id: "c10", item: "VII-10", label: "Total Tax Credits/Payments (Sum of Items 1 to 9) (To Part II Item 23)", f: (c) => ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c9"].reduce((a, id) => a + c.n(id), 0), bold: true },
    ] },
  ],
  split: 1,
  penalty: { base: "p26", surcharge: "p28", interest: "p27", compromise: "p29", total: "p30", grand: "p31", gross: (c) => (c.text("21") === "eight" ? c.n("s26") + c.n("s27") : c.n("s10")) },
  due: (v) => (/^\d{4}$/.test(v["1"] ?? "") ? annualReturnDue(Number(v["1"])) : ""),
  extraValidate: (v, _ctx, computed) => {
    const out: Issue[] = [];
    const bad = (id: string, item: string, message: string) => out.push({ id, item, message });
    const rate = ({ II012: "graduated", II014: "graduated", II013: "graduated", II015: "eight", II017: "eight", II016: "eight" } as Record<string, string>)[v["7"]];
    if (rate && v["21"] && rate !== v["21"]) bad("7", "7", `ATC ${v["7"]} is for ${rate === "graduated" ? "graduated rates" : "the 8% rate"}; Item 21 says otherwise.`);
    if (v["7"] === "II011" && v["6"] && v["6"] !== "compensation") bad("7", "7", "ATC II011 is for a compensation earner; Item 6 says otherwise.");
    if ((v["7"] === "II012" && v["6"] === "professional") || (v["7"] === "II014" && v["6"] === "single")) bad("7", "7", `ATC ${v["7"]} does not match the taxpayer type in Item 6.`);
    if (v["21"] === "graduated" && !v["21A"]) bad("21A", "21A", "Choose the method of deduction: itemized or OSD.");
    if (v["21"] === "eight" && Number(computed["s28A"] ?? 0) > RULES.eightPercent.ceiling) bad("21", "21", `The 8% rate is not available when gross sales/receipts and other non-operating income exceed P${RULES.eightPercent.ceiling.toLocaleString("en-PH")}.`);
    if (v["2"] === "yes" && !(Number(v["c6A"]) > 0)) bad("c6A", "VII-6", "This is an amended return: enter the tax paid in the return previously filed.");
    if (v["18"] === "joint" && !v["sp1"]) bad("sp1", "Part IV-1", "A joint return needs the spouse's TIN.");
    if (Number(computed["p24A"] ?? 0) < 0 && !v["OV"]) bad("OV", "Overpayment", "There is an overpayment: mark one box (refund, TCC or carry over).");
    if (Number(v["p25A"]) > Number(computed["p22A"] ?? 0) / 2) bad("p25A", "25", "The second installment may not exceed 50% of Item 22.");
    return out;
  },
  scoreExtra: [{ id: "7", weight: 2 }, { id: "21", weight: 2 }, { id: "21A", weight: 2 }],
});
