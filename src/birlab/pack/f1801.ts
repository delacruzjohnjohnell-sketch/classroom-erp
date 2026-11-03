// BIR Form 1801, January 2018 (ENCS): Estate Tax Return.
// Item numbers follow docs/bir-forms/1801-Jan-2018.pdf; printed on it: 6% rate, standard deduction P5 million (P500,000 for a non-resident alien), family home up to P10 million.
// Simplified: Schedules 1 to 5 (details of each property and deduction) are replaced by typed totals in Part IV Items 29 to 35. Column C (Total) is shown as extra "total" rows.
import { RULES } from "../rules/2026";
import { isIso, roundToPeso, usToIso } from "../engine/tax";
import { f, fields, makeForm, opts, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { caseOf, lessonOf, ymd } from "./kit";

/** One year after the date of death (Code Sec. 90; the 1801 PDF has no instruction page). */
function dueOf(v: Values): string {
  const d = usToIso(v["1"]);
  return isIso(d) ? ymd(Number(d.slice(0, 4)) + RULES.estateTaxDue.dueMonthsAfterDeath / 12, Number(d.slice(5, 7)), Number(d.slice(8, 10))) : "";
}
const peso = (n: number) => n * 100;

export const DEF = makeForm({
  id: "1801", number: "1801", title: "Estate Tax Return", subtitle: "Net taxable estate of a decedent",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 1801 Jan 2018 ENCS. Rate and deductions printed on the form; filed within one year from the date of death (Code Sec. 90; not printed on the PDF).",
  spouse: () => true, colLabels: ["A) Exclusive", "B) Conjugal/Communal"],
  identity: [
    fields(f("1", "1", "Date of Death (MM/DD/YYYY)", "date", { span: 4, required: true }), yes("2", "2", "Amended Return?", 3), f("3", "3", "No. of Sheet/s Attached", "count", { span: 2, required: true }), f("4", "4", "Alphanumeric Tax Code (ATC)", "radio", { span: 3, options: opts(["ES010", "ES 010 Estate tax"]), required: true })),
    fields(f("5", "5", "Estate's Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("6", "6", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("7", "7", "Taxpayer's Name (ESTATE OF Last Name, First Name, Middle Name)", "text", { span: 12, required: true })),
    fields(f("8", "8", "Residence of Decedent at the time of death", "text", { span: 9, required: true }), yes("9", "9", "Non-Resident Alien?", 3)),
    fields(f("10", "10", "Name of Executor / Administrator", "text", { span: 8, required: true }), f("11", "11", "TIN of Executor/Administrator", "tin", { span: 4, required: true })),
    fields(f("12", "12", "Contact Number", "phone", { span: 5 }), f("13", "13", "Email Address", "email", { span: 7 })),
    fields(yes("14", "14", "Are you availing of tax relief under a Special Law/International Tax Treaty?", 6), yes("15D", "15D", "Has an installment payment been granted?", 6)),
    fields(yes("15A", "15A", "Has an extension to file return been granted?", 4), yes("15B", "15B", "Has the estate been settled judicially?", 4), yes("15C", "15C", "Has an extension to pay the tax been granted?", 4)),
  ],
  required: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "14", "15A", "15B", "15C", "15D"].map((id) => ({ id, message: id === "3" ? "Enter the number of sheets attached (0 if none)." : `Item ${id} is required.` })),
  formats: { tin: ["5", "11"], rdo: ["6"], email: ["13"] },
  sections: [
    { id: "p4", title: "Part IV – Computation of Tax", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up. Column A: exclusive property of the decedent; column B: conjugal/communal property.", lines: [
      { id: "29", item: "29", label: "Real Properties Excluding Family Home (From Part V Schedule 1)" },
      { id: "30", item: "30", label: "Family Home (From Part V Sched. 1A)" },
      { id: "31", item: "31", label: "Personal Properties (From Part V Schedules 2 and 2A)" },
      { id: "32", item: "32", label: "Taxable Transfer (From Part V Schedule 3)" },
      { id: "33", item: "33", label: "Business Interest (From Part V Schedule 4)" },
      { id: "34", item: "34", label: "Gross Estate (Sum of Items 29 to 33)", f: (c) => c.n("29") + c.n("30") + c.n("31") + c.n("32") + c.n("33"), bold: true },
      { id: "T34", item: "34 (C)", label: "Gross Estate: Total (Column A plus Column B)", f: (c) => c.both("34"), cols: ["A"], bold: true, key: true },
      { id: "35", item: "35", label: "Less: Ordinary Deductions (From Part V Schedule 5)" },
      { id: "36", item: "36", label: "Estate after Ordinary Deductions (Item 34 Less Item 35)", f: (c) => c.n("34") - c.n("35") },
      { id: "T36", item: "36 (C)", label: "Estate after Ordinary Deductions: Total", f: (c) => c.both("36"), cols: ["A"], bold: true },
      { heading: "Less: Special Deductions" },
      { id: "37A", item: "37A", label: "Standard Deduction (P5 million for a citizen or resident; P500 thousand for a non-resident alien)", f: (c) => peso(c.text("9") === "yes" ? RULES.estateTax.standardNonResident : RULES.estateTax.standardResident), cols: ["A"], indent: 1 },
      { id: "37B", item: "37B", label: "Family Home (fair market value or P10 million, whichever is lower; resident citizen only; if conjugal, half of the value)", f: (c) => (c.text("9") === "yes" ? 0 : Math.min(c.at("30", "A") + Math.round(c.at("30", "B") / 2), peso(RULES.estateTax.familyHomeCap))), cols: ["A"], indent: 1 },
      { id: "37C", item: "37C", label: "Others (specify)", cols: ["A"], indent: 1, specify: true },
      { id: "37D", item: "37D", label: "Total Special Deductions (Sum of Items 37A to 37C)", f: (c) => c.n("37A") + c.n("37B") + c.n("37C"), cols: ["A"] },
      { id: "38", item: "38", label: "NET ESTATE (Item 36 Total Less Item 37D)", f: (c) => c.n("T36") - c.n("37D"), cols: ["A"], bold: true, key: true },
      { id: "39", item: "39", label: "Less: Share of Surviving Spouse (Net Conjugal Estate under Item 36, Column B, divided by 2)", f: (c) => roundToPeso(Math.round(c.at("36", "B") / 2)), cols: ["A"] },
      { id: "40", item: "40", label: "NET TAXABLE ESTATE (Item 38 Less Item 39) (To Part II Item 16)", f: (c) => Math.max(c.n("38") - c.n("39"), 0), cols: ["A"], bold: true, key: true },
    ] },
    { id: "p2", title: "Part II – Total Tax Payable", cols: ["A"], lines: [
      { id: "16", item: "16", label: "NET TAXABLE ESTATE (From Part IV, Item 40)", f: (c) => c.n("40") },
      { id: "18", item: "18", label: "ESTATE TAX DUE (Item 16 multiplied by the 6.0% rate in Item 17)", f: (c) => roundToPeso(Math.round(c.n("16") * RULES.estateTax.rate)), bold: true, key: true },
      { id: "19A", item: "19A", label: "Less: Foreign Estate Tax Paid", indent: 1 },
      { id: "19B", item: "19B", label: "Tax Paid in Return Previously Filed, if this is an Amended Return", indent: 1 },
      { id: "19C", item: "19C", label: "Total (Sum of Items 19A and 19B)", f: (c) => c.n("19A") + c.n("19B"), indent: 1 },
      { id: "20", item: "20", label: "Tax Payable (Item 18 Less Item 19C)", f: (c) => c.n("18") - c.n("19C"), bold: true, key: true },
      { id: "21", item: "21", label: "Less: Portion of tax allowed for payment by installment" },
      { id: "22", item: "22", label: "Tax Payable (1st installment) (Item 20 Less Item 21)", f: (c) => c.n("20") - c.n("21") },
      { heading: "Add: Penalties" },
      { id: "23A", item: "23A", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "23B", item: "23B", label: "Interest", f: () => 0, indent: 1 },
      { id: "23C", item: "23C", label: "Compromise", indent: 1 },
      { id: "23D", item: "23D", label: "Total Penalties (Sum of Items 23A to 23C)", f: () => 0 },
      { id: "24", item: "24", label: "TOTAL AMOUNT PAYABLE (For full payment: Items 20 and 23D; for installment: Items 22 and 23D)", f: () => 0, bold: true, key: true },
    ] },
  ],
  penalty: { base: "22", surcharge: "23A", interest: "23B", compromise: "23C", total: "23D", grand: "24", cols: ["A"], gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v, _ctx, computed): Issue[] => {
    const out: Issue[] = [];
    if (Number(v["21A"]) > 0 && v["15D"] !== "yes") out.push({ id: "21A", item: "21", message: "An installment portion is only allowed when the installment payment has been granted (Item 15D = Yes)." });
    if (Number(v["21A"]) > Number(computed["20A"] ?? 0)) out.push({ id: "21A", item: "21", message: "The installment portion cannot be more than the tax payable (Item 20)." });
    if (v["2"] === "yes" && !(Number(v["19BA"]) > 0)) out.push({ id: "19BA", item: "19B", message: "This is an amended return: enter the tax paid in the return previously filed (Item 19B)." });
    return out;
  },
});

const P = (n: number, rdo: string, name: string, residence: string, executor: string): Values => ({ "5": `000-${n}-135-00000`, "6": rdo, "7": name, "8": residence, "10": executor, "11": `000-${n}-246-00000`, "12": `0917000${n}`, "13": `estate${n}@example.com` });
const common = { "2": "no", "3": "2", "4": "ES010", "9": "no", "14": "no", "15A": "no", "15B": "no", "15C": "no", "15D": "no" } as const;

export const CASES = [
  caseOf({
    form: "1801", level: "easy", year: 2025, title: "A widower's exclusive estate",
    story: ["Ernesto V. Salvador, a Filipino citizen resident in Cabanatuan City (Barangay Mabini), a widower, died on February 10, 2025. All his property was exclusive: real properties other than the family home ₱12,000,000; the family home ₱4,000,000; personal properties ₱3,000,000; no taxable transfers or business interest. Ordinary deductions (funeral, judicial expenses, claims against the estate) total ₱1,000,000. His daughter Perla E. Salvador is the administrator.", "The administrator files and pays in full on December 15, 2025, within the one year. Fill in BIR Form 1801."],
    profile: P(241, "025", "ESTATE OF SALVADOR, ERNESTO, VILLAREAL", "BRGY. MABINI, CABANATUAN CITY, NUEVA ECIJA", "SALVADOR, PERLA, ESCOBAR"),
    facts: { ...common, "1": "02/10/2025", "29A": "12000000", "30A": "4000000", "31A": "3000000", "35A": "1000000" },
    filing: "2025-12-15", klass: "large",
    why: "The tax on the transfer of a decedent's estate is reported with Form 1801 (estate tax return).",
    hints: ["Gross estate = real properties + family home + personal properties + other items.", "Special deductions: standard ₱5 million plus the family home (up to ₱10 million).", "The estate tax is 6% of the net taxable estate."],
    solution: ["Gross estate (Item 34) = ₱12,000,000 + ₱4,000,000 + ₱3,000,000 = ₱19,000,000. Estate after ordinary deductions (Item 36) = ₱18,000,000.", "Special deductions: standard ₱5,000,000 + family home ₱4,000,000 = ₱9,000,000. Net estate (Item 38) = ₱9,000,000; no surviving spouse share; net taxable estate (Item 40) = ₱9,000,000.", "Estate tax due (Item 18) = 6% × ₱9,000,000 = ₱540,000. On time: Item 24 = ₱540,000."],
  }),
  caseOf({
    form: "1801", level: "average", year: 2025, title: "A married decedent with conjugal property",
    story: ["Manuel C. Aquino, a Filipino citizen resident in San Jose City (Barangay Abar 1st), died on April 3, 2025, leaving a spouse. Exclusive property: personal properties ₱1,000,000. Conjugal property: real properties other than the family home ₱8,000,000; the family home ₱6,000,000; personal properties ₱2,000,000. Ordinary deductions: ₱100,000 from the exclusive property and ₱900,000 from the conjugal property. The family home deduction for a conjugal home is half of its value (₱3,000,000), within the ₱10 million cap.",
      "His spouse Lorna P. Aquino is the executor and files on April 1, 2026. Fill in BIR Form 1801."],
    profile: P(242, "026", "ESTATE OF AQUINO, MANUEL, CRUZ", "BRGY. ABAR 1ST, SAN JOSE CITY, NUEVA ECIJA", "AQUINO, LORNA, PEREZ"),
    facts: { ...common, "1": "04/03/2025", "31A": "1000000", "29B": "8000000", "30B": "6000000", "31B": "2000000", "35A": "100000", "35B": "900000" },
    filing: "2026-04-01", klass: "large",
    why: "The tax on the transfer of a decedent's estate is reported with Form 1801, including the conjugal property and the surviving spouse's share.",
    hints: ["Compute each column; the total of both is used for the net estate.", "The surviving spouse's share is half of the net conjugal estate (Item 36, column B).", "Family home deduction for a conjugal home: half of its value."],
    solution: ["Gross estate: A ₱1,000,000; B ₱8,000,000 + ₱6,000,000 + ₱2,000,000 = ₱16,000,000; total ₱17,000,000. After ordinary deductions: A ₱900,000; B ₱15,100,000; total ₱16,000,000.", "Special deductions = ₱5,000,000 (standard) + ₱3,000,000 (half of ₱6,000,000) = ₱8,000,000. Net estate (Item 38) = ₱16,000,000 − ₱8,000,000 = ₱8,000,000.", "Share of surviving spouse (Item 39) = ₱15,100,000 ÷ 2 = ₱7,550,000. Net taxable estate (Item 40) = ₱450,000. Estate tax due (Item 18) = 6% × ₱450,000 = ₱27,000. Item 24 = ₱27,000."],
  }),
  caseOf({
    form: "1801", level: "difficult", year: 2024, title: "Foreign estate tax, installment, and a late return",
    story: ["Gregorio T. Sison, a Filipino citizen resident in Gapan City (Barangay Mapalad), died on March 18, 2024, unmarried. Exclusive property: real properties ₱20,000,000 (he owned no family home) and personal properties ₱5,000,000. Ordinary deductions ₱3,000,000. The estate paid ₱120,000 of foreign estate tax on a property abroad. The BIR granted an installment: the estate may pay ₱450,000 of the tax payable later (Item 21).",
      "The return was due March 18, 2025. The executor, Ramon G. Sison, files and pays the first installment on April 17, 2025, 30 days late. The general penalty rates apply (25% surcharge, 12% interest a year by the day over 365) on the first installment (Item 22); the compromise assessed is ₱10,000. Fill in BIR Form 1801."],
    profile: P(243, "027", "ESTATE OF SISON, GREGORIO, TANGLAO", "BRGY. MAPALAD, GAPAN CITY, NUEVA ECIJA", "SISON, RAMON, GARCIA"),
    facts: { ...common, "1": "03/18/2024", "3": "3", "15D": "yes", "29A": "20000000", "31A": "5000000", "35A": "3000000", "19AA": "120000", "21A": "450000", "23CA": "10000" },
    filing: "2025-04-17", klass: "large",
    why: "The tax on the transfer of a decedent's estate is reported with Form 1801, including a foreign estate tax credit and an installment.",
    hints: ["No family home: only the standard deduction.", "Estate tax payable = estate tax due − foreign estate tax paid.", "Penalties are computed on the first installment (Item 22)."],
    solution: ["Gross estate = ₱25,000,000; after ordinary deductions ₱22,000,000. Special deductions = ₱5,000,000 (standard; no family home). Net estate = net taxable estate = ₱17,000,000.", "Estate tax due (Item 18) = 6% × ₱17,000,000 = ₱1,020,000. Less foreign estate tax ₱120,000: tax payable (Item 20) = ₱900,000. Less installment portion ₱450,000: first installment (Item 22) = ₱450,000.", "30 days late: surcharge = 25% × ₱450,000 = ₱112,500; interest = ₱450,000 × 12% × 30 ÷ 365 = ₱4,438.36 → ₱4,438; compromise ₱10,000; total penalties ₱126,938. Item 24 = ₱450,000 + ₱126,938 = ₱576,938."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1801: Estate Tax Return", minutes: "About 9 minutes",
  sections: [
    ["1. What estate tax is", "Estate tax is a tax on the transfer of a decedent's net estate to the heirs. Under the TRAIN law the rate is a flat 6% on the net taxable estate (printed on the form), for deaths on or after January 1, 2018. The return is filed by the executor, administrator or heirs and the tax is generally paid within one year from the date of death (Code Sec. 90; the PDF has no instruction page, so the deadline is flagged in the rules file). An extension of time to file or pay, a judicial settlement, and an installment of payment are possible and are recorded in Item 15."],
    ["2. From gross estate to net taxable estate", "Part IV starts with the gross estate: real properties excluding the family home, the family home, personal properties (including shares of stock), taxable transfers and business interest, each in two columns: exclusive property of the decedent and conjugal/communal property. Ordinary deductions (funeral and judicial expenses, claims against the estate, unpaid mortgages, losses and others) give the estate after ordinary deductions. Special deductions follow: the standard deduction of ₱5 million for a citizen or resident (₱500,000 for a non-resident alien), and the family home deduction (the fair market value or ₱10 million, whichever is lower, for a resident citizen only; for a conjugal home the value counted is half). The result is the net estate. The surviving spouse's share (half of the net conjugal estate) is then removed to get the net taxable estate (Item 40)."],
    ["3. Tax due, credits, penalties", "The estate tax due is 6% of the net taxable estate. Foreign estate tax paid and tax paid in an earlier return (if amended) are credited. If an installment is granted, the portion deferred (Item 21) is subtracted and the first installment (Item 22) is paid now. A late return adds a surcharge, interest and compromise on the amount payable now (25% and 12% a year in general; these are individual/estate taxpayers, so the micro and small reduced rates do not apply)."],
  ],
  worked: { intro: "A resident citizen's exclusive estate: gross estate ₱10,000,000, ordinary deductions ₱1,000,000, no family home.", steps: ["Estate after ordinary deductions ₱9,000,000; standard deduction ₱5,000,000; net estate ₱4,000,000.", "Estate tax = 6% × ₱4,000,000 = ₱240,000."], title: "Form 1801", table: { "34 (C)": "10,000,000", "36 (C)": "9,000,000", "37A": "5,000,000", "38": "4,000,000", "40": "4,000,000", "18": "240,000" } },
  legal: ["NIRC Sec. 84 (rate of 6% as amended by RA 10963), Sec. 85 (gross estate), Sec. 86 (deductions), Sec. 90 (return and payment), Sec. 91; BIR Form 1801 (January 2018 ENCS)."],
  guide: [
    ["1 to 4", "1", "Date of death, amended, sheets, ATC ES 010.", "Death certificate.", "Using the date of filing."],
    ["5 to 15D", "5", "Estate's TIN, RDO, name, residence of decedent, non-resident alien?, executor and TIN, contact, tax relief, extensions and installment.", "Court and BIR records.", "Marking a non-resident alien as resident."],
    ["29 to 34", "29A", "Properties by type, in the exclusive and conjugal columns; gross estate and its total are computed.", "Inventory of the estate.", "Putting conjugal property in column A."],
    ["35 and 36", "35A", "Ordinary deductions by column; estate after ordinary deductions is computed.", "Receipts, claims.", "Deducting beyond the allowed items."],
    ["37 to 40", "37AA", "Standard and family home deductions are computed; other special deductions typed; net estate, spouse's share and net taxable estate are computed.", "Computed.", "Counting the full conjugal family home."],
    ["16 to 24", "19AA", "Computed tax; foreign estate tax paid; installment portion; penalties from the filing date; compromise typed.", "Filing date.", "Penalties on the full tax when an installment applies."],
  ],
  checklist: ["Get the inventory of properties and their FMV.", "Separate exclusive and conjugal property.", "List deductions with proof.", "Remember the one-year deadline."],
  pitfalls: ["Family home deduction mistakes.", "Spouse's share forgotten.", "Wrong standard deduction (non-resident alien).", "Penalty base."],
  amended: "Tick Yes in Item 2 and enter the tax paid in the original return in Item 19B.",
  noPayment: "If the net taxable estate is zero, the return is still filed.",
  quiz: [
    ["The estate tax rate under TRAIN is:", ["6%", "10%", "20%", "Graduated"], 0, "A flat 6%."],
    ["The standard deduction for a citizen or resident is:", ["₱500,000", "₱1 million", "₱5 million", "₱10 million"], 2, "₱5 million."],
    ["Net conjugal estate after ordinary deductions is ₱10,000,000. The surviving spouse's share is:", ["₱10,000,000", "₱5,000,000", "₱2,500,000", "₱0"], 1, "Half of the net conjugal estate."],
    ["The estate tax return is due in general:", ["30 days after death", "6 months after death", "One year from death", "April 15"], 2, "Within one year from the date of death."],
    ["The family home deduction is limited to:", ["₱1 million", "₱5 million", "₱10 million", "No limit"], 2, "The lower of FMV and ₱10 million."],
  ],
});
