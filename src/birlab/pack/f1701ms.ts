// BIR Form 1701-MS, August 2024: Annual Income Tax Return for Individuals Classified as MICRO or SMALL Taxpayers.
// Item numbers follow docs/bir-forms/1701-MS-Aug-2024.pdf and its Guide. Ids are prefixed because the printed form reuses numbers across parts:
// mNN = Part II, cN = Part IV.A, bN = Part IV.B, vN = Part V. Special/preferential and exempt regimes (Items 13 to 21, 16 to 18A, Part VI) are not simulated.
import { RULES } from "../rules/2026";
import { annualReturnDue, eightPercentTax, graduatedTax, optionalStandardDeduction } from "../engine/tax";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { caseOf, lessonOf } from "./kit";

const joint = (v: Values) => v["5"] === "joint";
const isGrad = (c: { text: (id: string) => string }) => c.text("12") === "graduated";
const isEight = (c: { text: (id: string) => string }) => c.text("12") === "eight";

export const DEF = makeForm({
  id: "1701-MS", number: "1701-MS", title: "Annual Income Tax Return", subtitle: "For Individuals Classified as MICRO or SMALL Taxpayers",
  version: "August 2024", versionNote: "Official PDF: 1701-MS August 2024 and its Guide. Due April 15, installment over P2,000 (both from the Guide). Micro: gross sales under P3M; small: P3M to under P20M (Guide).",
  spouse: joint, yearId: "1",
  identity: [
    fields(f("1", "1", "For the Year (MM/YYYY)", "monthyear", { span: 3, required: true }), yes("2", "2", "Amended Return?", 3), yes("3", "3", "Short Period Return?", 3)),
    radio("4", "4", "Civil Status", opts(["single", "Single"], ["married", "Married"], ["separated", "Legally Separated"], ["widow", "Widow/er"])),
    radio("5", "5", "If married, you are filing", opts(["joint", "Jointly"], ["separate", "Separately"], ["na", "Not applicable, spouse has no income"]), { required: false }),
    fields(f("6", "6", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("7", "7", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("8", "8", "Taxpayer's Name (Last Name, First Name, Suffix, Middle Name)", "text", { span: 12, required: true })),
    fields(f("9", "9", "Email Address", "email", { span: 6 }), f("10", "10", "Contact Number (Landline/Cellphone No.)", "phone", { span: 6 })),
    radio("11", "11", "Source of Income", opts(["business", "Income from Business"], ["profession", "Income from Profession"], ["mixed", "Mixed Income"])),
    radio("12", "12", "Income is subject to (if two or more activities or multiple tax regimes, use Form 1701)", opts(["graduated", "Graduated Income Tax Rates"], ["eight", "8% Income Tax Rate"])),
    fields(f("17", "17", "Method of Deduction", "radio", { span: 12, options: opts(["itemized", "Itemized Deduction"], ["osd", "Optional Standard Deduction (OSD) 40%"]) })),
    radio("18", "18", "Alphanumeric Tax Code (ATC)", opts(["II012", "II012 Business Income - Graduated"], ["II014", "II014 Income from Profession - Graduated"], ["II013", "II013 Mixed Income - Graduated"], ["II011", "II011 Compensation Income"], ["II015", "II015 Business Income - 8%"], ["II017", "II017 Income from Profession - 8%"], ["II016", "II016 Mixed Income - 8%"])),
    fields(f("6B", "6 (B)", "Spouse's TIN (joint filing only)", "tin", { span: 7 }), f("8B", "8 (B)", "Spouse's Name (joint filing only)", "text", { span: 5 })),
    fields(f("35", "35", "Number of Attachments", "count", { span: 3, required: true })),
  ],
  required: ["1", "2", "3", "4", "6", "7", "8", "11", "12", "18", "35"].map((id) => ({ id, message: id === "35" ? "Enter the number of attachments (0 if none)." : `Item ${id} is required.` })),
  formats: { tin: ["6", "6B"], rdo: ["7"], email: ["9"] },
  sections: [
    { id: "p2", title: "Part II – Total Income Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "m22", item: "22", label: "Income Tax Due - Regular Rate (From Part IV Item 18B OR Item 25)", f: (c) => (isEight(c) ? c.n("b25") : c.n("b18B")) },
      { id: "m23", item: "23", label: "Total Income Tax Due (Sum of Items 21 and 22; special rates are not simulated)", f: (c) => c.n("m22") },
      { id: "m24", item: "24", label: "Less: Total Tax Credits/Payments (From Part V Item 10)", f: (c) => c.n("v10") },
      { id: "m25", item: "25", label: "Tax Payable/(Overpayment) (Item 23 Less Item 24)", f: (c) => c.n("m23") - c.n("m24"), bold: true, key: true },
      { id: "m26", item: "26", label: "Less: Tax Due Allowed for 2nd Installment to be paid on or before October 15 (50% or less of Item 23)" },
      { id: "m27", item: "27", label: "Amount of Tax Payable/(Overpayment) (Item 25 Less Item 26)", f: (c) => c.n("m25") - c.n("m26"), bold: true },
      { heading: "Add: Penalties" },
      { id: "m28A", item: "28A", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "m28B", item: "28B", label: "Interest", f: () => 0, indent: 1 },
      { id: "m28C", item: "28C", label: "Compromise", indent: 1 },
      { id: "m28D", item: "28D", label: "Total Penalties (Sum of Items 28A to 28C)", f: () => 0 },
      { id: "m29", item: "29", label: "Total Amount Payable/(Overpayment) (Sum of Items 27 and 28D)", f: () => 0, bold: true, key: true },
    ] },
    { id: "p4a", title: "Part IV.A – Taxable Compensation Income", lines: [
      { id: "c1", item: "1", label: "Gross Compensation Income" },
      { id: "c2", item: "2", label: "Less: Non-Taxable / Exempt Compensation" },
      { id: "c3", item: "3", label: "Taxable Compensation Income (Item 1 Less Item 2)", f: (c) => c.n("c1") - c.n("c2"), key: true },
      { id: "c4", item: "4", label: "Tax Due-Compensation Income (Item 3 x applicable Income Tax Rate from Table 2)", f: (c) => graduatedTax(c.n("c3"), c.year || 2023) },
    ] },
    { id: "p4b1", title: "Part IV.B1 – For Graduated Income Tax Rates", lines: [
      { id: "b5", item: "5", label: "Sales/Revenues/Fees" },
      { id: "b6", item: "6", label: "Less: Sales Returns, Allowances and Discounts" },
      { id: "b7", item: "7", label: "Net Sales/Revenues/Fees (Item 5 Less Item 6)", f: (c) => c.n("b5") - c.n("b6"), when: isGrad },
      { id: "b8", item: "8", label: "Less: Cost of Sales/Services (applicable only if availing Itemized Deductions)" },
      { id: "b9", item: "9", label: "Gross Income/(Loss) from Operation (Item 7 Less Item 8)", f: (c) => c.n("b7") - c.n("b8"), when: isGrad },
      { id: "b10A", item: "10A", label: "Ordinary Allowable Itemized Deductions" },
      { id: "b10B", item: "10B", label: "Special Allowable Itemized Deductions" },
      { id: "b10C", item: "10C", label: "Net Operating Loss Carry Over (NOLCO)" },
      { id: "b10D", item: "10D", label: "Total Allowable Itemized Deductions (Sum of Items 10A to 10C)", f: (c) => (c.text("17") === "itemized" ? c.n("b10A") + c.n("b10B") + c.n("b10C") : 0), when: isGrad },
      { id: "b11", item: "11", label: "OR Optional Standard Deduction (OSD) (40% of Item 7)", f: (c) => (c.text("17") === "osd" ? optionalStandardDeduction(c.n("b7")) : 0), when: isGrad },
      { id: "b12", item: "12", label: "Net Income/(Loss) (If Itemized: Item 9 Less Item 10D; If OSD: Item 9 Less Item 11)", f: (c) => (c.text("17") === "osd" ? c.n("b7") - c.n("b11") : c.n("b9") - c.n("b10D")), when: isGrad, key: true },
      { id: "b13", item: "13", label: "Add: Other Non-Operating Income" },
      { id: "b14", item: "14", label: "Taxable Income-Business (Sum of Items 12 and 13)", f: (c) => c.n("b12") + c.n("b13"), when: isGrad },
      { id: "b15", item: "15", label: "Total Taxable Income - Compensation & Business (Sum of Items 3 and 14)", f: (c) => c.n("c3") + c.n("b14"), when: isGrad, key: true },
      { id: "b18B", item: "18B", label: "Total Tax Due-Compensation & Business Income (under graduated rates) (Item 15 x Table 2) (To Part II Item 22)", f: (c) => graduatedTax(c.n("b15"), c.year || 2023), when: isGrad, bold: true, key: true },
    ] },
    { id: "p4b2", title: "Part IV.B2 – For 8% Income Tax Rate", lines: [
      { id: "b19", item: "19", label: "Sales/Revenues/Fees (net of sales returns, allowances and discounts)" },
      { id: "b20", item: "20", label: "Add: Other Non-Operating Income" },
      { id: "b21", item: "21", label: "Total Income (Sum of Items 19 and 20)", f: (c) => c.n("b19") + c.n("b20"), when: isEight },
      { id: "b22", item: "22", label: "Less: Allowable reduction of P250,000 (not applicable if with compensation income)", f: (c) => (c.n("c1") > 0 ? 0 : RULES.eightPercent.reduction * 100), when: isEight },
      { id: "b23", item: "23", label: "Taxable Income/(Loss) (Item 21 Less Item 22)", f: (c) => c.n("b21") - c.n("b22"), when: isEight },
      { id: "b24", item: "24", label: "Tax Due - Business Income (Item 23 x 8% Income Tax Rate)", f: (c) => eightPercentTax(c.n("b23")), when: isEight },
      { id: "b25", item: "25", label: "Total Tax Due-Compensation & Business Income (under 8% Income Tax Rate) (Sum of Items 4 and 24) (To Part II Item 22)", f: (c) => c.n("c4") + c.n("b24"), when: isEight, bold: true, key: true },
    ] },
    { id: "p5", title: "Part V – Tax Credits/Payments (attach proof)", lines: [
      { id: "v1", item: "V-1", label: "Prior Year's Excess Credits" },
      { id: "v2", item: "V-2", label: "Tax Payments for the First Three (3) Quarters" },
      { id: "v3", item: "V-3", label: "Creditable Tax Withheld for the First Three (3) Quarters" },
      { id: "v4", item: "V-4", label: "Creditable Tax Withheld per BIR Form No. 2307 or 1606 for the 4th Quarter" },
      { id: "v5", item: "V-5", label: "Creditable Tax Withheld per BIR Form No. 2316" },
      { id: "v6", item: "V-6", label: "Tax Paid in Return Previously Filed, if this is an Amended Return" },
      { id: "v7", item: "V-7", label: "Foreign Tax Credits (specify Foreign Tax Number, if applicable)", specify: true },
      { id: "v9", item: "V-9", label: "Other Tax Credits/Payments (specify)", specify: true },
      { id: "v10", item: "V-10", label: "Total Tax Credits/Payments (Sum of Items 1 to 9) (To Part II Item 24)", f: (c) => ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v9"].reduce((a, id) => a + c.n(id), 0), bold: true },
    ] },
  ],
  split: 1,
  penalty: { base: "m27", surcharge: "m28A", interest: "m28B", compromise: "m28C", total: "m28D", grand: "m29", gross: (c) => (c.text("12") === "eight" ? c.n("b19") + c.n("b20") : c.n("b7")) },
  due: (v) => { const m = (v["1"] ?? "").match(/(\d{4})$/); return m ? annualReturnDue(Number(m[1])) : ""; },
  extraValidate: (v, _ctx, computed) => {
    const out: Issue[] = [];
    const bad = (id: string, item: string, message: string) => out.push({ id, item, message });
    const rate = ({ II012: "graduated", II014: "graduated", II013: "graduated", II015: "eight", II017: "eight", II016: "eight" } as Record<string, string>)[v["18"]];
    if (rate && v["12"] && rate !== v["12"]) bad("18", "18", `ATC ${v["18"]} is for ${rate === "graduated" ? "graduated rates" : "the 8% rate"}; Item 12 says otherwise.`);
    if (v["12"] === "graduated" && !v["17"]) bad("17", "17", "Choose the method of deduction.");
    const gross = Number(computed["b21A"] ?? 0) || Number(computed["b7A"] ?? 0);
    if (gross >= RULES.classification.smallBelow) bad("12", "12", "Form 1701-MS is only for micro and small taxpayers (gross sales under P20,000,000). Use Form 1701.");
    if (v["12"] === "eight" && Number(computed["b21A"] ?? 0) > RULES.eightPercent.ceiling) bad("12", "12", "The 8% rate is not available above P3,000,000.");
    if (v["2"] === "yes" && !(Number(v["v6A"]) > 0)) bad("v6A", "V-6", "This is an amended return: enter the tax paid in the return previously filed.");
    if (Number(v["m26A"]) > Number(computed["m23A"] ?? 0) / 2) bad("m26A", "26", "The second installment may not exceed 50% of Item 23.");
    if (Number(v["m26A"]) > 0 && Number(computed["m23A"] ?? 0) <= RULES.installment.minTaxDue) bad("m26A", "26", "The second installment is allowed only when the tax due is in excess of P2,000.");
    if (v["5"] === "joint" && !v["6B"]) bad("6B", "6 (B)", "A joint return needs the spouse's TIN.");
    return out;
  },
  scoreExtra: [{ id: "12", weight: 2 }, { id: "17", weight: 2 }, { id: "18", weight: 2 }],
});

const P = (n: number, rdo: string, name: string): Values => ({ "6": `000-000-${n}-00000`, "7": rdo, "8": name, "9": `${name.split(",")[1].trim().toLowerCase()}.${n}@example.com`, "10": `0917000${n}` });
const common = { "2": "no", "3": "no", "4": "single", "5": "na" } as const;

export const CASES = [
  caseOf({
    form: "1701-MS", level: "easy", year: 2025, title: "A micro taxpayer: tailoring shop on OSD",
    story: [
      "Elena P. Domingo, 52, single, runs a tailoring shop in Barangay Santo Rosario, Cabanatuan City, Nueva Ecija 3100. She is a single proprietor and a MICRO taxpayer (her sales are far below ₱3 million). She uses graduated rates with the optional standard deduction. She has no other income.",
      "2025: sales ₱480,000, returns and discounts ₱30,000. She paid ₱1,000 with her first three 1701Q returns and has no other credits. She files and pays in full on April 9, 2026 and attaches one proof of payment.",
      "Because she is a micro taxpayer, the BIR's simplified annual return applies. Fill in BIR Form 1701-MS for the year 2025.",
    ],
    profile: P(401, "025", "DOMINGO, ELENA, PADILLA"),
    facts: { ...common, "1": "12/2025", "11": "business", "12": "graduated", "17": "osd", "18": "II012", "35": "1", b5A: "480000", b6A: "30000", v2A: "1000" },
    filing: "2026-04-09", klass: "micro",
    why: "She is a micro taxpayer earning only from business, so the simplified Form 1701-MS is the correct return for her.",
    hints: ["OSD is 40% of Item 7 (net sales).", "Item 15 adds taxable compensation (zero here) and taxable business income.", "Quarterly payments go to Part V Item 2."],
    solution: ["Net sales (Item 7) = ₱480,000 − ₱30,000 = ₱450,000. OSD (Item 11) = 40% × ₱450,000 = ₱180,000. Net income (Item 12) = ₱270,000 = taxable income (Items 14, 15).", "Tax (Item 18B), Table 2: 15% × (₱270,000 − ₱250,000) = ₱3,000.", "Credits (Part V Item 10) = ₱1,000. Tax payable (Item 25) = ₱3,000 − ₱1,000 = ₱2,000. On time: Item 29 = ₱2,000."],
  }),
  caseOf({
    form: "1701-MS", level: "average", year: 2025, title: "A micro taxpayer on the 8% rate with a second installment",
    story: [
      "Dindo Q. Ramos, 33, single, a freelance graphic designer in Barangay Pagas, Cabanatuan City, Nueva Ecija 3100, is a professional on the 8% rate (ATC II017). He is a micro taxpayer with no compensation income.",
      "2025: professional fees net of discounts ₱1,500,000 and ₱20,000 commission from a stock-photo site (other non-operating income, not subject to final tax). He paid ₱80,000 with his first three 1701Qs and received 2307s: ₱6,000 for the first three quarters and ₱4,000 for the fourth quarter. He will pay ₱10,000 of the net tax payable by October 15 (Item 26).",
      "He files on April 15, 2026 with three attachments. Fill in BIR Form 1701-MS for 2025.",
    ],
    profile: P(402, "025", "RAMOS, DINDO, QUEZON"),
    facts: { ...common, "1": "12/2025", "11": "profession", "12": "eight", "18": "II017", "35": "3", b19A: "1500000", b20A: "20000", v2A: "80000", v3A: "6000", v4A: "4000", m26A: "10000" },
    filing: "2026-04-15", klass: "micro",
    why: "A micro taxpayer with income purely from a profession files the simplified Form 1701-MS, with the 8% schedule (IV.B2).",
    hints: ["8% path: Items 19 to 25. The ₱250,000 reduction applies because he has no compensation income.", "Credits: Items 2, 3 and 4 of Part V.", "The installment (Item 26) may be up to 50% of Item 23."],
    solution: ["Total income (Item 21) = ₱1,500,000 + ₱20,000 = ₱1,520,000. Less ₱250,000 (Item 22): taxable income (Item 23) = ₱1,270,000.", "Tax due (Items 24, 25) = 8% × ₱1,270,000 = ₱101,600 (no compensation, so Item 4 is zero).", "Credits = ₱80,000 + ₱6,000 + ₱4,000 = ₱90,000. Tax payable (Item 25) = ₱101,600 − ₱90,000 = ₱11,600.", "Installment (Item 26) = ₱10,000 (≤ 50% × ₱101,600). Amount payable now (Item 27) = ₱1,600; the ₱10,000 is paid by October 15."],
  }),
  caseOf({
    form: "1701-MS", level: "difficult", year: 2025, title: "A small taxpayer with salary, itemized deductions and a late filing",
    story: [
      "Atty. Carla Fernandez, 41, single, is employed by a law office and also has her own notarial and consultancy practice at Barangay Mayapyap, Cabanatuan City, Nueva Ecija 3100. She has mixed income (professional, ATC II013) under graduated rates with itemized deductions. Her practice's sales are about ₱3.4 million, so she is a SMALL taxpayer (₱3 million to under ₱20 million).",
      "Compensation: gross ₱420,000, non-taxable ₱20,000, tax withheld per the 2316 ₱20,000. Practice: fees ₱3,600,000, less ₱200,000 returns and discounts; no cost of sales. Itemized deductions: ordinary ₱1,900,000, special ₱0, NOLCO ₱100,000. Other non-operating income ₱40,000 (not subject to final tax). Credits: ₱120,000 paid with the first three 1701Qs, ₱30,000 creditable tax withheld in the first three quarters, ₱15,000 per the 2307s of the fourth quarter, and the 2316 withholding.",
      "She files and pays on May 31, 2026, 46 days late. As a small taxpayer the surcharge is 10% and interest 6% a year, by the day over 365. The compromise penalty assessed is ₱3,000. Four attachments. Fill in BIR Form 1701-MS for 2025.",
    ],
    profile: P(403, "025", "FERNANDEZ, CARLA, SANTOS"),
    facts: { ...common, "1": "12/2025", "11": "mixed", "12": "graduated", "17": "itemized", "18": "II013", "35": "4", c1A: "420000", c2A: "20000", b5A: "3600000", b6A: "200000", b10AA: "1900000", b10CA: "100000", b13A: "40000", v2A: "120000", v3A: "30000", v4A: "15000", v5A: "20000", m28CA: "3000" },
    filing: "2026-05-31", klass: "small",
    why: "She is a small taxpayer with mixed income under graduated rates and a single tax regime, so Form 1701-MS applies.",
    hints: ["Net sales (Item 7) is fees less returns and discounts.", "Itemized deductions: Items 10A + 10B + 10C = Item 10D.", "April 15 to May 31, 2026 is 46 days; the penalties use the small-taxpayer rates."],
    solution: ["Taxable compensation (Item 3) = ₱420,000 − ₱20,000 = ₱400,000.", "Net sales (Item 7) = ₱3,600,000 − ₱200,000 = ₱3,400,000; gross income (Item 9) = ₱3,400,000. Itemized deductions (Item 10D) = ₱1,900,000 + ₱0 + ₱100,000 = ₱2,000,000. Net income (Item 12) = ₱1,400,000. Plus ₱40,000 other income: Item 14 = ₱1,440,000.", "Total taxable income (Item 15) = ₱400,000 + ₱1,440,000 = ₱1,840,000. Tax (Item 18B), Table 2: ₱102,500 + 25% × ₱1,040,000 = ₱362,500.", "Credits = ₱120,000 + ₱30,000 + ₱15,000 + ₱20,000 = ₱185,000. Tax payable (Items 25, 27) = ₱362,500 − ₱185,000 = ₱177,500.", "46 days late. Surcharge (Item 28A) = 10% × ₱177,500 = ₱17,750. Interest (Item 28B) = ₱177,500 × 6% × 46 ÷ 365 = ₱1,342.19, rounded to ₱1,342. Compromise ₱3,000. Total penalties = ₱22,092. Total amount payable (Item 29) = ₱177,500 + ₱22,092 = ₱199,592."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1701-MS: Annual Income Tax Return for individuals classified as micro or small taxpayers", minutes: "About 7 minutes",
  sections: [
    ["1. Who files 1701-MS", "Form 1701-MS (August 2024) is the simplified annual income tax return for individuals earning from business or profession (and mixed-income earners) who are classified as MICRO (gross sales under ₱3,000,000) or SMALL (₱3,000,000 to under ₱20,000,000) taxpayers, per the form's Guide. A taxpayer with two or more activities or multiple tax regimes or rates uses Form 1701 instead. It replaces 1701A for these taxpayers in the BIR's 2024 and later guidance; the lab teaches both and each case states which one the facts call for. A May 2026 circular (RMC 37-2026) addresses the manner of filing of 1701-MS, 1701 and 1701A; the scanned copy is unreadable, so verify the latest announcement."],
    ["2. Structure and computation", "The form has the same logic as Form 1701 on fewer pages. Part IV.A computes taxable compensation (if any) and the tax on it. Part IV.B1 is for graduated rates (net sales, cost of sales if itemized, itemized deductions or the 40% OSD of net sales, other non-operating income). Part IV.B2 is for the 8% rate: total income less the ₱250,000 reduction (only without compensation income) times 8%. Under graduated rates compensation and business income are added and ONE tax is computed (Item 18B); under 8% the tax on compensation (Item 4) is added to the 8% business tax (Item 25).", "Part V lists the credits (prior excess, quarterly payments, withholding, 2307s, 2316, amended, foreign, other). Part II brings it together: tax due, credits, tax payable, the second installment, penalties and the total amount payable."],
    ["3. Deadline, installment and penalties", "The return is filed and the tax paid on or before April 15 (from the Guide). When the tax due is in excess of ₱2,000, it may be paid in two installments, the second on or before October 15 (up to 50% of Item 23). A late return carries surcharge, interest and a compromise penalty. The EOPT law reduces these for micro and small taxpayers to 10% and 6% a year (verify the schedule; see the rules file); interest is counted by the day over 365."],
  ],
  worked: { intro: "Tina is a micro taxpayer: net sales ₱600,000 on OSD, no compensation, credits ₱3,000.", steps: ["OSD 40% × ₱600,000 = ₱240,000; net income and taxable income = ₱360,000.", "Tax = 15% × (₱360,000 − ₱250,000) = ₱16,500; payable after credits = ₱13,500."], title: "Form 1701-MS", table: { "7": "600,000", "11": "240,000", "12": "360,000", "15": "360,000", "18B": "16,500", "V-10": "3,000", "25": "13,500" } },
  legal: ["NIRC Sec. 24(A) as amended by RA 10963; Sec. 34; Sec. 51; Sec. 56(A)(2) (installment). BIR Form 1701-MS (August 2024) and its Guide.", "RA 11976 (EOPT) and RR 8-2024 for micro and small classification and penalties."],
  guide: [
    ["1 to 5", "1", "Taxable year as MM/YYYY (12/2025), amended or not, short period or not, civil status, and joint or separate filing if married.", "Your records.", "Writing the filing date in Item 1."],
    ["6 to 10", "6", "TIN, RDO, name, email and contact number.", "COR.", "Wrong name order."],
    ["11 and 12", "11", "Source of income (business, profession, mixed) and the tax regime (graduated or 8%).", "COR and first-quarter election.", "Choosing 8% when sales exceed ₱3M."],
    ["17 and 18", "17", "Method of deduction and ATC.", "Your election.", "ATC that does not match the regime."],
    ["IV.A 1 to 4", "c1A", "Compensation, exempt part; taxable compensation and its tax are computed.", "2316.", "Forgetting compensation of a mixed earner."],
    ["IV.B1 5 to 15", "b5A", "Sales, returns, cost of sales, deductions or OSD, other income; net income and total taxable income are computed.", "Books.", "OSD plus itemized."],
    ["IV.B2 19 to 25", "b19A", "8%: sales, other income; reduction and tax are computed.", "Books.", "Reduction for a mixed earner."],
    ["V 1 to 10", "v1A", "Credits; total is computed.", "1701Qs, 2307, 2316.", "Using one 2307 twice."],
    ["II 22 to 29", "m22A", "Computed tax due, credits, payable; installment (typed); penalties.", "Computed.", "Penalty on the wrong base."],
    ["35", "35", "Number of attachments.", "Your list.", "Leaving blank."],
  ],
  checklist: ["Confirm you are micro or small by gross sales.", "Check the regime and method from your first quarterly return.", "Gather 2316, 2307s, 1701Q proofs.", "Know your filing date."],
  pitfalls: ["Using 1701-MS with multiple regimes (use 1701).", "Taking the ₱250,000 reduction as a mixed earner.", "OSD with actual expenses.", "Wrong ATC.", "Centavos."],
  amended: "Tick Yes in Item 2 and enter the tax paid in the original return in Part V Item 6.",
  noPayment: "If credits cover the tax, nothing is payable but the return is still due on April 15; an overpayment needs the irrevocable choice (refund, TCC, carry-over).",
  quiz: [
    ["A taxpayer with gross sales of ₱3,500,000 is classified as:", ["Micro", "Small", "Medium", "Large"], 1, "Small taxpayers have gross sales from ₱3 million to under ₱20 million."],
    ["Form 1701-MS is due on or before:", ["March 31", "April 15", "June 30", "October 15"], 1, "April 15 of the following year."],
    ["Net sales ₱500,000 on OSD, no other income. Taxable income?", ["₱200,000", "₱300,000", "₱500,000", "₱250,000"], 1, "OSD = 40% × 500,000 = 200,000; 500,000 − 200,000 = 300,000."],
    ["The second installment is allowed when the tax due is:", ["Any amount", "In excess of ₱2,000", "Below ₱2,000", "Over ₱100,000"], 1, "The Guide: when a tax due is in excess of ₱2,000."],
    ["A professional with salary uses the 8% rate. The Item 22 reduction is:", ["₱250,000", "Half", "₱0", "₱125,000"], 2, "Not applicable if with compensation income."],
  ],
});
