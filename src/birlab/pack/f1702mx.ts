// BIR Form 1702-MX, January 2018 (ENCS): Annual Income Tax Return, Corporation, Partnership and Other Non-Individual Taxpayer with MIXED income.
// Item numbers follow docs/bir-forms/1702-MX-Jan-2018.pdf. The printed Schedule 2 has four columns (A exempt, B special, C special relief under regular rate, D total);
// this lab uses two: A = regular/normal rate and B = special/preferential rate (for example a proprietary educational institution at 10%), and totals are computed.
// Simplified: Schedule 1 (basis of tax relief), Schedule 4, NOLCO schedules and Parts V to VI are not simulated; Item 10 is typed as a total.
import { RULES } from "../rules/2026";
import { roundToPeso } from "../engine/tax";
import { f, fields, makeForm, opts } from "../forms/kit";
import type { Issue } from "../forms/types";
import { CORP_REQUIRED, corpAnnualDue, corpIdentity, corpPerson } from "./corp";
import { caseOf, lessonOf } from "./kit";

const ATC = opts(["IC010", "IC 010 Domestic Corporation - In General"], ["IC030", "IC 030 Proprietary Educational Institutions"], ["IC055", "IC 055 Minimum Corporate Income Tax (MCIT)"], ["IC011", "IC 011 Exempt Corporation on Exempt Activities"]);
const pct = (t: string) => (Number(t) || 0) / 100;
const osdOn = (c: { text: (id: string) => string; col: "A" | "B" }) => c.text("13") === "osd" && c.col === "A";

export const DEF = makeForm({
  id: "1702-MX", number: "1702-MX", title: "Annual Income Tax Return", subtitle: "Corporation, Partnership and Other Non-Individual Taxpayer with MIXED Income (regular rate and special/preferential rate)",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 1702-MX Jan 2018 ENCS Final with OSD v2. Due: 15th day of the 4th month after the close of the taxable year.",
  yearId: "2", spouse: () => true, colLabels: ["A) Regular rate", "B) Special rate"],
  identity: corpIdentity(ATC, "Method of Deduction (OSD applies to the regular-rate column)", [
    fields(f("rA", "14A", "Applicable income tax rate, regular column (Item 14A)", "radio", { span: 6, options: opts(["25", "25%"], ["20", "20%"]) }), f("rB", "14B", "Applicable income tax rate, special column (Item 14B, for example 10%)", "radio", { span: 6, options: opts(["10", "10%"], ["5", "5%"], ["15", "15%"]) })),
    fields(f("22", "22", "Number of Attachments", "count", { span: 3, required: true })),
    fields(f("OV", "Overpayment", "If overpayment, mark one box only (irrevocable)", "radio", { span: 12, options: opts(["refund", "To be refunded"], ["tcc", "To be issued a Tax Credit Certificate (TCC)"], ["carry", "To be carried over as a tax credit for next year/quarter"]) })),
  ]),
  required: [...CORP_REQUIRED, { id: "22", message: "Enter the number of attachments (0 if none)." }, { id: "rA", message: "Choose the regular income tax rate (Item 14A)." }],
  formats: { tin: ["6"], rdo: ["7"], zip: ["9A"], email: ["12"] },
  sections: [
    { id: "p2", title: "Part II – Total Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", cols: ["A"], lines: [
      { id: "14", item: "14", label: "Total Tax Due/(Overpayment) (From Part IV-Schedule 2 Item 19D)", f: (c) => c.both("x19") },
      { id: "15", item: "15", label: "Less: Total Tax Credits/Payments (From Part IV-Schedule 3 Item 32)", f: (c) => c.n("y32") },
      { id: "16", item: "16", label: "Net Tax Payable / (Overpayment) (Item 14 Less Item 15)", f: (c) => c.n("14") - c.n("15"), bold: true, key: true },
      { heading: "Add: Penalties" },
      { id: "17", item: "17", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "18", item: "18", label: "Interest", f: () => 0, indent: 1 },
      { id: "19", item: "19", label: "Compromise", indent: 1 },
      { id: "20", item: "20", label: "Total Penalties (Sum of Items 17 to 19)", f: () => 0 },
      { id: "21", item: "21", label: "TOTAL AMOUNT PAYABLE / (Overpayment) (Sum of Items 16 and 20)", f: () => 0, bold: true, key: true },
    ] },
    { id: "s2", title: "Schedule 2 – Computation of Income Tax per Tax Regime", note: "Column A: regular/normal rate. Column B: special/preferential rate.", lines: [
      { id: "x1", item: "S2-1", label: "Sales/Receipts/Revenues/Fees" },
      { id: "x2", item: "S2-2", label: "Less: Sales Returns, Allowances and Discounts" },
      { id: "x3", item: "S2-3", label: "Net Sales/Receipts/Revenues/Fees (Item 1 Less Item 2)", f: (c) => c.n("x1") - c.n("x2") },
      { id: "x4", item: "S2-4", label: "Less: Cost of Sales/Services" },
      { id: "x5", item: "S2-5", label: "Gross Income from Operation (Item 3 Less Item 4)", f: (c) => c.n("x3") - c.n("x4") },
      { id: "x6", item: "S2-6", label: "Add: Other Taxable Income not subjected to Final Tax" },
      { id: "x7", item: "S2-7", label: "Total Taxable Income (Sum of Items 5 and 6)", f: (c) => c.n("x5") + c.n("x6"), key: true },
      { id: "x8", item: "S2-8", label: "Ordinary Allowable Itemized Deductions (From Sched 5 Item 18)" },
      { id: "x9", item: "S2-9", label: "Special Allowable Itemized Deductions (From Sched 6 Item 5)" },
      { id: "x10", item: "S2-10", label: "NOLCO" },
      { id: "x11", item: "S2-11", label: "Total Itemized Deductions (Sum of Items 8 to 10)", f: (c) => (osdOn(c) ? 0 : c.n("x8") + c.n("x9") + c.n("x10")) },
      { id: "x12", item: "S2-12", label: "Optional Standard Deduction (OSD) (40% of Item 7)", f: (c) => (osdOn(c) ? roundToPeso(Math.round(Math.max(c.n("x7"), 0) * RULES.osd.rate)) : 0) },
      { id: "x13", item: "S2-13", label: "Net Taxable Income/(Loss)", f: (c) => (osdOn(c) ? c.n("x7") - c.n("x12") : c.n("x7") - c.n("x11")), key: true },
      { id: "x15", item: "S2-15", label: "Income Tax Due other than MCIT (Item 13 x Item 14, the applicable income tax rate)", f: (c) => (c.n("x13") > 0 ? roundToPeso(Math.round(c.n("x13") * pct(c.col === "A" ? c.text("rA") : c.text("rB")))) : 0) },
      { id: "x16", item: "S2-16", label: "Less: Share of Other Government Agency, if remitted directly" },
      { id: "x17", item: "S2-17", label: "Net Income Tax Due to National Government (Item 15 Less Item 16)", f: (c) => c.n("x15") - c.n("x16") },
      { id: "x18", item: "S2-18", label: "MCIT (2% of Gross Income in Item 7) (regular rate only)", f: (c) => (c.col === "A" && c.n("x7") > 0 ? roundToPeso(Math.round(c.n("x7") * RULES.mcit.rate)) : 0), key: true },
      { id: "x19", item: "S2-19", label: "Total Income Tax Due/(Overpayment) (regular: Item 17 OR MCIT in Item 18, whichever is higher; special: Item 17)", f: (c) => (c.col === "A" ? Math.max(c.n("x17"), c.n("x18")) : c.n("x17")), bold: true, key: true },
    ] },
    { id: "s3", title: "Schedule 3 – Tax Credits/Payments (attach proof)", cols: ["A"], lines: [
      { id: "y20", item: "S3-20", label: "Prior Year's Excess Credits other than MCIT" },
      { id: "y21", item: "S3-21", label: "Income Tax Payment under MCIT from Previous Quarter/s" },
      { id: "y22", item: "S3-22", label: "Income Tax Payment under Regular Rate from Previous Qtr/s" },
      { id: "y23", item: "S3-23", label: "Excess MCIT Applied this Current Taxable Year" },
      { id: "y24", item: "S3-24", label: "Creditable Tax Withheld from Previous Qtr/s per BIR Form No. 2307" },
      { id: "y25", item: "S3-25", label: "Creditable Tax Withheld per BIR Form No. 2307 for the 4th Qtr" },
      { id: "y26", item: "S3-26", label: "Foreign Tax Credits, if applicable" },
      { id: "y27", item: "S3-27", label: "Tax Paid in Return Previously Filed, if this is an Amended Return" },
      { id: "y28", item: "S3-28", label: "Income Tax Payments under Special Rate from Previous Qtr/s" },
      { id: "y29", item: "S3-29", label: "Special Tax Credits" },
      { id: "y30", item: "S3-30", label: "Other Tax Credits/Payments (specify)", specify: true },
      { id: "y32", item: "S3-32", label: "Total Tax Credits/Payments (Sum of Items 20 to 31) (To Part II Item 15)", f: (c) => ["y20", "y21", "y22", "y23", "y24", "y25", "y26", "y27", "y28", "y29", "y30"].reduce((a, id) => a + c.n(id), 0), bold: true },
      { id: "y33", item: "S3-33", label: "Net Tax Payable / (Overpayment) (Item 19 Less Item 32) (To Part II Item 16)", f: (c) => c.both("x19") - c.n("y32"), bold: true },
    ] },
  ],
  split: 1,
  penalty: { base: "16", surcharge: "17", interest: "18", compromise: "19", total: "20", grand: "21", cols: ["A"], gross: (c) => c.both("x3") },
  due: corpAnnualDue,
  extraValidate: (v, _ctx, computed) => {
    const out: Issue[] = [];
    const bad = (id: string, item: string, message: string) => out.push({ id, item, message });
    if (v["rA"] === "20" && Number(computed["x13A"] ?? 0) > RULES.corporate.reducedNetTaxableCeiling) bad("rA", "14A", "The 20% rate is only for net taxable income of P5,000,000 or less.");
    if (Number(computed["x13B"] ?? 0) > 0 && !v["rB"]) bad("rB", "14B", "Choose the special rate (Item 14B).");
    if (v["3"] === "yes" && !(Number(v["y27A"]) > 0)) bad("y27A", "S3-27", "This is an amended return: enter the tax paid in the return previously filed.");
    if (Number(computed["16A"] ?? 0) < 0 && !v["OV"]) bad("OV", "Overpayment", "There is an overpayment: mark one box (refund, TCC or carry over).");
    return out;
  },
  scoreExtra: [{ id: "13", weight: 2 }, { id: "rA", weight: 2 }, { id: "rB", weight: 2 }],
});

const common = { "1": "calendar", "2": "12/2025", "3": "no", "4": "no", "13": "itemized", rA: "25", rB: "10" } as const;

export const CASES = [
  caseOf({
    form: "1702-MX", level: "easy", year: 2025, title: "A school with rental income",
    story: [
      "St. Joseph Academy of Cabanatuan, Inc. is a proprietary educational institution in Cabanatuan City, Nueva Ecija 3100. Its tuition and school income is taxed at the special 10% rate (column B). It also leases a building to a canteen operator; the rental is a regular-rate activity at 25% (column A, MCIT does not exceed the normal tax). It uses itemized deductions in both columns.",
      "2025: tuition ₱20,000,000 with ordinary deductions of ₱16,000,000. Rental income ₱1,000,000 with ordinary deductions of ₱200,000. Quarterly payments: ₱100,000 under the regular rate and ₱250,000 under the special rate. Creditable tax withheld per the 2307s of the fourth quarter: ₱50,000.",
      "It files and pays on April 14, 2026 with three attachments. Fill in BIR Form 1702-MX for the year ended 12/2025.",
    ],
    profile: corpPerson(701, "025", "ST. JOSEPH ACADEMY OF CABANATUAN, INC.", "BRGY. SANGITAN, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "5": "IC030", "22": "3", x1A: "1000000", x8A: "200000", x1B: "20000000", x8B: "16000000", y22A: "100000", y28A: "250000", y25A: "50000" },
    filing: "2026-04-14", klass: "medium",
    why: "The institution has income under two tax regimes (regular and special rate), so it files the mixed-income Form 1702-MX.",
    hints: ["Compute each column on its own: A regular, B special.", "Item 19 for the regular column is the higher of the normal tax and the MCIT.", "Item 14 in Part II is the total of both columns."],
    solution: ["Regular (A): taxable income (Item 7) ₱1,000,000; deductions ₱200,000; net ₱800,000; tax 25% = ₱200,000; MCIT 2% × ₱1,000,000 = ₱20,000; Item 19A = ₱200,000.", "Special (B): taxable income ₱20,000,000; deductions ₱16,000,000; net ₱4,000,000; tax 10% = ₱400,000 = Item 19B.", "Total tax due (Part II Item 14) = ₱600,000. Credits = ₱100,000 + ₱250,000 + ₱50,000 = ₱400,000. Net tax payable (Item 16) = ₱200,000. On time: Item 21 = ₱200,000."],
  }),
  caseOf({
    form: "1702-MX", level: "average", year: 2025, title: "Mixed income with OSD on the regular side",
    story: [
      "Holy Family College of San Jose, Inc., San Jose City, Nueva Ecija 3121, has educational income at the special 10% rate (column B, itemized) and bookstore and rental income at the regular 25% rate (column A). For the regular column it uses the OSD (40% of gross income).",
      "2025: regular activities ₱2,000,000 gross income; educational income ₱12,000,000 with ordinary deductions of ₱10,500,000. Credits: ₱30,000 excess credit from 2024, ₱120,000 paid with the quarterly returns under the regular rate, ₱100,000 under the special rate, and ₱20,000 per the 2307s of the fourth quarter.",
      "It files on April 15, 2026 with four attachments. Fill in BIR Form 1702-MX for the year ended 12/2025.",
    ],
    profile: corpPerson(702, "026", "HOLY FAMILY COLLEGE OF SAN JOSE, INC.", "BRGY. CRUZ NA LIGAS, SAN JOSE CITY, NUEVA ECIJA", "3121"),
    facts: { ...common, "5": "IC030", "13": "osd", "22": "4", x1A: "2000000", x1B: "12000000", x8B: "10500000", y20A: "30000", y22A: "120000", y28A: "100000", y25A: "20000" },
    filing: "2026-04-15", klass: "medium",
    why: "Income under two regimes (regular and special rate) means Form 1702-MX.",
    hints: ["The OSD applies to the regular column only.", "Regular: OSD ₱800,000 from ₱2,000,000; net ₱1,200,000.", "Credits: prior year excess in Item 20."],
    solution: ["Regular (A): gross income ₱2,000,000; OSD (Item 12) = ₱800,000; net taxable ₱1,200,000; tax 25% = ₱300,000; MCIT 2% = ₱40,000; Item 19A = ₱300,000.", "Special (B): ₱12,000,000 − ₱10,500,000 = ₱1,500,000; tax 10% = ₱150,000.", "Total tax due ₱450,000. Credits = ₱30,000 + ₱120,000 + ₱100,000 + ₱20,000 = ₱270,000. Net tax payable ₱180,000."],
  }),
  caseOf({
    form: "1702-MX", level: "difficult", year: 2025, title: "MCIT on the regular side, special deductions, late",
    story: [
      "Gapan Technical Institute, Inc., Gapan City, Nueva Ecija 3105, is a proprietary educational institution. Regular activities (rentals and a canteen) earned ₱1,500,000 with deductions of ₱1,480,000, so the normal tax at 20% is small and the MCIT may be higher. Educational income ₱8,000,000 with ordinary deductions of ₱5,000,000 and special allowable deductions of ₱200,000 (special rate 10%).",
      "Credits: MCIT payments of previous quarters ₱10,000, payments under the special rate ₱150,000, 2307s of the first three quarters ₱20,000 and of the fourth quarter ₱15,000.",
      "It files and pays on May 29, 2026, 44 days late. As a small taxpayer (net sales under ₱20 million) the surcharge is 10% and interest 6% a year by the day over 365; the compromise assessed is ₱3,000 (enter as given). Five attachments. Fill in BIR Form 1702-MX for the year ended 12/2025.",
    ],
    profile: corpPerson(703, "027", "GAPAN TECHNICAL INSTITUTE, INC.", "BRGY. SAN VICENTE, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "5": "IC055", "22": "5", rA: "20", x1A: "1500000", x8A: "1480000", x1B: "8000000", x8B: "5000000", x9B: "200000", y21A: "10000", y28A: "150000", y24A: "20000", y25A: "15000", "19A": "3000" },
    filing: "2026-05-29", klass: "small",
    why: "Two tax regimes in one year (regular with MCIT, and special rate) means Form 1702-MX.",
    hints: ["Net taxable income in the regular column is tiny, so compare with the MCIT (2% of Item 7).", "Special deductions in column B reduce its net taxable income before the 10% rate.", "April 15 to May 29, 2026 is 44 days; penalties are on Item 16."],
    solution: ["Regular (A): net taxable ₱20,000 → 20% = ₱4,000; MCIT 2% × ₱1,500,000 = ₱30,000; Item 19A = ₱30,000 (MCIT; ATC IC 055).", "Special (B): ₱8,000,000 − (₱5,000,000 + ₱200,000) = ₱2,800,000 → 10% = ₱280,000.", "Total tax due ₱310,000. Credits = ₱10,000 + ₱150,000 + ₱20,000 + ₱15,000 = ₱195,000. Net tax payable (Item 16) = ₱115,000.", "Surcharge = 10% × ₱115,000 = ₱11,500. Interest = ₱115,000 × 6% × 44 ÷ 365 = ₱831.78 → ₱832. Compromise ₱3,000. Total penalties ₱15,332. Item 21 = ₱130,332."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1702-MX: Annual Income Tax Return for non-individuals with mixed income", minutes: "About 9 minutes",
  sections: [
    ["1. Who files 1702-MX", "A corporation, partnership or other non-individual taxpayer with MIXED income, meaning income under more than one tax regime in the same year: for example regular-rate income together with exempt income, or together with income taxed at a special or preferential rate (a proprietary educational institution taxed 10% on its school income but 25% on unrelated rentals, a registered enterprise with a special rate, and so on). A taxpayer with only regular-rate income files 1702-RT; with only exempt income, 1702-EX. The printed form computes each regime in a column (exempt, special, special-relief-under-regular, and the total); this lab uses two columns, regular and special, with totals computed."],
    ["2. The computation", "For each regime: sales less returns and cost of sales give gross income; add other taxable income to reach Item 7. Subtract itemized deductions (ordinary, special, NOLCO) or the OSD of 40% of Item 7 (regular rate only) to reach net taxable income. The tax is net taxable income times the applicable rate (Item 14); a share belonging to another government agency may be deducted. The regular column also computes the MCIT, 2% of Item 7, and the tax due is the HIGHER of the normal tax and the MCIT. The tax due of the regimes is added to reach the total in Part II Item 14. Schedule 3 lists credits, including payments of previous quarters under the regular rate, under the MCIT and under the special rate."],
    ["3. Deadline and penalties", "The annual return is due on or before the 15th day of the 4th month after the close of the taxable year. A late return carries surcharge, interest and compromise computed on the net tax payable (Item 16): 25% and 12% in general, 10% and 6% for micro and small taxpayers (verify; see the rules file)."],
  ],
  worked: { intro: "A school: regular side net taxable ₱500,000 at 25%, special side net taxable ₱2,000,000 at 10%.", steps: ["Regular: 25% × ₱500,000 = ₱125,000 (compare with MCIT).", "Special: 10% × ₱2,000,000 = ₱200,000.", "Total tax due = ₱325,000."], title: "Form 1702-MX", table: { "13A": "500,000", "19A": "125,000", "13B": "2,000,000", "19B": "200,000", "14": "325,000" } },
  legal: ["NIRC Sec. 27(A) and (B) (10% on proprietary educational institutions and hospitals; 25%/20% rates as amended by RA 11534), Sec. 27(E) (MCIT), Sec. 34, Sec. 52; BIR Form 1702-MX January 2018 (ENCS)."],
  guide: [
    ["1 to 13", "1", "Calendar or fiscal, year ended, amended, short period, ATC, identity, method of deduction.", "COR.", "Wrong ATC."],
    ["14A, 14B", "rA", "The regular-rate box and the special-rate box.", "Eligibility.", "Wrong rate."],
    ["S2 1 to 7", "x1A", "Per column: sales, returns, cost, other income; computed gross income (Item 7).", "Books of each activity.", "Mixing columns."],
    ["S2 8 to 13", "x8A", "Ordinary, special, NOLCO; total or OSD (regular only); net taxable income.", "Schedules.", "OSD in the special column."],
    ["S2 15 to 19", "x15A", "Computed tax at the column's rate; MCIT (regular); total tax due.", "Computed.", "Ignoring MCIT."],
    ["S3 20 to 33", "y20A", "Credits by type; net payable.", "Quarterly returns, 2307s.", "Wrong payment type."],
    ["14 to 21", "14A", "Computed totals; compromise typed; penalties from the filing date.", "Filing date.", "Penalty on the wrong base."],
  ],
  checklist: ["Separate each activity by regime.", "Compute MCIT for the regular rate.", "List payments per regime and quarter.", "Prepare the attachments for each activity."],
  pitfalls: ["Netting losses across regimes.", "OSD on special rate income.", "No MCIT check.", "Credits in the wrong regime."],
  amended: "Tick Yes in Item 3 and enter the tax paid in the original return in Schedule 3 Item 27.",
  noPayment: "If credits cover the tax, choose one overpayment option.",
  quiz: [
    ["A school has regular rental income and special-rate school income. Which form?", ["1702-RT", "1702-EX", "1702-MX", "1701"], 2, "Income under more than one regime: 1702-MX."],
    ["MCIT applies to which column?", ["Special rate", "Regular rate", "Both", "Neither"], 1, "MCIT is a regular-rate concept."],
    ["Regular normal tax ₱4,000, MCIT ₱30,000. The regular tax due:", ["₱4,000", "₱30,000", "₱34,000", "₱26,000"], 1, "Whichever is higher."],
    ["The OSD may be used in:", ["The special column", "The regular column", "Both", "Neither"], 1, "Applicable to the regular rate (Sec. 27(A))."],
    ["Net taxable ₱2,800,000 at the special 10% rate gives:", ["₱28,000", "₱280,000", "₱700,000", "₱2,800,000"], 1, "10% × ₱2,800,000 = ₱280,000."],
  ],
});
