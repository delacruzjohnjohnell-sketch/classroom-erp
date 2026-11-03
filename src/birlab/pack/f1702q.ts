// BIR Form 1702Q, January 2018 (ENCS): Quarterly Income Tax Return for Corporations, Partnerships and Other Non-Individual Taxpayers.
// Item numbers follow docs/bir-forms/1702Q-Jan-2018.pdf. Simplified: Schedule 1 (exempt and special rates) and Item 15 (unexpired excess MCIT) are not simulated;
// the regular/normal rate (Schedule 2), the MCIT (Schedule 3) and the credits (Schedule 4) are. Schedule rows are ids sN, mN, cN.
import { RULES } from "../rules/2026";
import { roundToPeso } from "../engine/tax";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { corpPerson } from "./corp";
import { addDays, caseOf, lastDay, lessonOf, parseMonth, ymd } from "./kit";

const ATC = opts(["IC010", "IC 010 Domestic Corporation - In General"], ["IC055", "IC 055 Minimum Corporate Income Tax (MCIT)"], ["IC030", "IC 030 Proprietary Educational Institutions"]);

/** The quarterly return is due within 60 days after the close of the quarter (Guidelines and Instructions, 1702Q). */
function dueOf(v: Values): string {
  const p = parseMonth(v["2"]), q = Number(v["3"]);
  if (!p || !(q >= 1 && q <= 3)) return "";
  const [m, y] = p;
  const endIdx = y * 12 + (m - 1) - 12 + 3 * q; // months since year 0 of the quarter's closing month
  const qy = Math.floor(endIdx / 12), qm = (endIdx % 12) + 1;
  return addDays(ymd(qy, qm, lastDay(qy, qm)), RULES.corporateDue.quarterlyDays);
}
const rate = (t: string) => (Number(t) || 0) / 100;

export const DEF = makeForm({
  id: "1702Q", number: "1702Q", title: "Quarterly Income Tax Return", subtitle: "For Corporations, Partnerships and Other Non-Individual Taxpayers",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 1702Q 2018ENCS final2. Due: within 60 days after the close of each of the first three quarters (its Guidelines and Instructions).",
  yearId: "2",
  identity: [
    fields(f("1", "1", "For", "radio", { span: 4, options: opts(["calendar", "Calendar"], ["fiscal", "Fiscal"]), required: true }), f("2", "2", "Year Ended (MM/YYYY)", "monthyear", { span: 3, required: true }), f("3", "3", "Quarter", "radio", { span: 3, options: opts(["1", "1st"], ["2", "2nd"], ["3", "3rd"]), required: true }), yes("4", "4", "Amended Return?", 2)),
    radio("5", "5", "Alphanumeric Tax Code (ATC)", ATC),
    fields(f("6", "6", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("7", "7", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("8", "8", "Registered Name", "text", { span: 12, required: true })),
    fields(f("9", "9", "Registered Address", "text", { span: 9, required: true }), f("9A", "9A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("10", "10", "Contact Number", "phone", { span: 5 }), f("11", "11", "Email Address", "email", { span: 7 })),
    radio("12", "12", "Method of Deductions", opts(["itemized", "Itemized Deductions [Section 34 (A-J), NIRC]"], ["osd", "Optional Standard Deduction (OSD) - 40% of Gross Income [Section 34(L), NIRC]"])),
    fields(yes("13", "13", "Are you availing of tax relief under Special Law/International Tax Treaty?", 6)),
    fields(f("26", "26", "Number of Attachments", "count", { span: 3, required: true })),
    fields(f("OV", "Overpayment", "If overpayment, mark one box only (irrevocable)", "radio", { span: 12, options: opts(["refund", "To be refunded"], ["tcc", "To be issued a Tax Credit Certificate (TCC)"], ["carry", "To be carried over as a tax credit for next year/quarter"]) })),
    fields(f("r", "Sch. 2-10", "Applicable Income Tax Rate (except MCIT)", "radio", { span: 12, options: opts(["25", "25%"], ["20", "20%"]) })),
  ],
  required: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "9A", "12", "13", "26"].map((id) => ({ id, message: id === "26" ? "Enter the number of attachments (0 if none)." : `Item ${id} is required.` })),
  formats: { tin: ["6"], rdo: ["7"], zip: ["9A"], email: ["11"] },
  sections: [
    { id: "p2", title: "Part II – Total Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "14", item: "14", label: "Income Tax Due - Regular/Normal Rate (From Part IV - Schedule 2, Item 13)", f: (c) => c.n("s13") },
      { id: "16", item: "16", label: "Balance/Income Tax Still Due - Regular/Normal Rate (Item 14 Less Item 15; unexpired excess MCIT is not simulated)", f: (c) => c.n("14") },
      { id: "18", item: "18", label: "Aggregate Income Tax Due (Sum of Items 16 and 17; no special-rate income here)", f: (c) => c.n("16") },
      { id: "19", item: "19", label: "Less: Total Tax Credits/Payments (From Part IV - Schedule 4, Item 7)", f: (c) => c.n("c7") },
      { id: "20", item: "20", label: "Net Tax Payable / (Overpayment) (Item 18 Less Item 19)", f: (c) => c.n("18") - c.n("19"), bold: true, key: true },
      { heading: "Add: Penalties" },
      { id: "21", item: "21", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "22", item: "22", label: "Interest", f: () => 0, indent: 1 },
      { id: "23", item: "23", label: "Compromise", indent: 1 },
      { id: "24", item: "24", label: "Total Penalties (Sum of Items 21 to 23)", f: () => 0 },
      { id: "25", item: "25", label: "TOTAL AMOUNT PAYABLE / (Overpayment) (Sum of Items 20 and 24)", f: () => 0, bold: true, key: true },
    ] },
    { id: "s2", title: "Schedule 2 – Declaration this Quarter – REGULAR/NORMAL RATE", lines: [
      { id: "s1", item: "S2-1", label: "Sales/Receipts/Revenues/Fees" },
      { id: "s2", item: "S2-2", label: "Less: Cost of Sales/Services" },
      { id: "s3", item: "S2-3", label: "Gross Income from Operation (Item 1 Less Item 2)", f: (c) => c.n("s1") - c.n("s2") },
      { id: "s4", item: "S2-4", label: "Add: Non-Operating and Other Taxable Income" },
      { id: "s5", item: "S2-5", label: "Total Gross Income (Sum of Items 3 and 4)", f: (c) => c.n("s3") + c.n("s4"), key: true },
      { id: "s6", item: "S2-6", label: "Less: Deductions (itemized this quarter, or leave blank for OSD)" },
      { id: "s7", item: "S2-7", label: "Taxable Income this Quarter (Item 5 Less Item 6; with OSD, Item 5 less 40% of Item 5)", f: (c) => (c.text("12") === "osd" ? c.n("s5") - roundToPeso(Math.round(Math.max(c.n("s5"), 0) * RULES.osd.rate)) : c.n("s5") - c.n("s6")) },
      { id: "s8", item: "S2-8", label: "Add: Taxable Income Previous Quarter/s" },
      { id: "s9", item: "S2-9", label: "Total Taxable Income to Date (Sum of Items 7 and 8)", f: (c) => c.n("s7") + c.n("s8"), key: true },
      { id: "s11", item: "S2-11", label: "Income Tax Due Other than MCIT (Item 9 multiply by Item 10, the applicable rate)", f: (c) => (c.n("s9") > 0 ? roundToPeso(Math.round(c.n("s9") * rate(c.text("r")))) : 0), key: true },
      { id: "s12", item: "S2-12", label: "Minimum Corporate Income Tax (MCIT) (From Schedule 3 Item 6)", f: (c) => c.n("m6") },
      { id: "s13", item: "S2-13", label: "Income Tax Due (Normal Income Tax in Item 11 or MCIT in Item 12 whichever is higher) (To Part II Item 14)", f: (c) => Math.max(c.n("s11"), c.n("s12")), bold: true, key: true },
    ] },
    { id: "s3", title: "Schedule 3 – Computation of Minimum Corporate Income Tax (MCIT) for the Quarter/s", lines: [
      { id: "m1", item: "S3-1", label: "Gross Income Regular/Normal Rate - 1st Quarter" },
      { id: "m2", item: "S3-2", label: "Gross Income Regular/Normal Rate - 2nd Quarter" },
      { id: "m3", item: "S3-3", label: "Gross Income Regular/Normal Rate - 3rd Quarter" },
      { id: "m4", item: "S3-4", label: "Total Gross Income (Sum of Items 1 to 3)", f: (c) => c.n("m1") + c.n("m2") + c.n("m3") },
      { id: "m6", item: "S3-6", label: "Minimum Corporate Income Tax (2% of Item 4) (To Schedule 2 Item 12)", f: (c) => (c.n("m4") > 0 ? roundToPeso(Math.round(c.n("m4") * RULES.mcit.rate)) : 0), key: true },
    ] },
    { id: "s4", title: "Schedule 4 – Tax Credits/Payments", lines: [
      { id: "c1", item: "S4-1", label: "Prior Year's Excess Credits" },
      { id: "c2", item: "S4-2", label: "Tax payment/s for the previous quarter/s of the same taxable year other than MCIT" },
      { id: "c3", item: "S4-3", label: "MCIT payment/s for the previous quarter/s of the same taxable year" },
      { id: "c4", item: "S4-4", label: "Creditable Tax Withheld for the previous quarter/s" },
      { id: "c5", item: "S4-5", label: "Creditable Tax Withheld per BIR Form No. 2307 for this quarter" },
      { id: "c6", item: "S4-6", label: "Tax paid in return previously filed if this is an amended return" },
      { id: "c7", item: "S4-7", label: "Total Tax Credits/Payments (Sum of Items 1 to 6) (To Part II Item 19)", f: (c) => ["c1", "c2", "c3", "c4", "c5", "c6"].reduce((a, id) => a + c.n(id), 0), bold: true },
    ] },
  ],
  split: 1,
  penalty: { base: "20", surcharge: "21", interest: "22", compromise: "23", total: "24", grand: "25", cols: ["A"], gross: (c) => c.n("s1") },
  due: dueOf,
  extraValidate: (v, _ctx, computed) => {
    const out: Issue[] = [];
    const bad = (id: string, item: string, message: string) => out.push({ id, item, message });
    if (!v["r"]) bad("r", "S2-10", "Enter the applicable income tax rate.");
    const mcitHigher = Number(computed["s12A"] ?? 0) > Number(computed["s11A"] ?? 0);
    if (v["5"] && mcitHigher && v["5"] !== "IC055") bad("5", "5", "The MCIT in Schedule 2 Item 12 is higher than the normal tax, so the ATC is IC 055.");
    if (v["5"] === "IC055" && !mcitHigher) bad("5", "5", "ATC IC 055 is for when the MCIT is the tax due; here the normal tax is higher (use IC 010).");
    if (v["4"] === "yes" && !(Number(v["c6A"]) > 0)) bad("c6A", "S4-6", "This is an amended return: enter the tax paid in the return previously filed.");
    if (Number(computed["20A"] ?? 0) < 0 && !v["OV"]) bad("OV", "Overpayment", "There is an overpayment: mark one box (refund, TCC or carry over).");
    return out;
  },
  scoreExtra: [{ id: "5", weight: 2 }, { id: "12", weight: 2 }, { id: "r", weight: 2 }],
});

const common = { "1": "calendar", "2": "12/2025", "4": "no", "13": "no", "12": "itemized" } as const;
const P = (n: number, rdo: string, name: string, addr: string, zip: string): Values => { const b = corpPerson(n, rdo, name, addr, zip); return { "6": b["6"], "7": b["7"], "8": b["8"], "9": b["9"], "9A": b["9A"], "10": b["11"], "11": b["12"] }; };

export const CASES = [
  caseOf({
    form: "1702Q", level: "easy", year: 2025, title: "First quarter, regular rate",
    story: [
      "Santos Feeds Trading Corp., Cabanatuan City, Nueva Ecija 3100, is a domestic corporation (calendar year, itemized deductions, 25% rate). For January to March 2025 its sales were ₱3,000,000, cost of sales ₱1,800,000, and deductions ₱700,000. It has no other income. It had a ₱5,000 excess credit from 2024 and a 2307 for this quarter of ₱15,000.",
      "The first-quarter return is due 60 days after March 31. It files on May 28, 2025 with one attachment. Fill in BIR Form 1702Q for the first quarter of 2025.",
    ],
    profile: P(801, "025", "SANTOS FEEDS TRADING CORP.", "BRGY. KAPITAN PEPE, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "3": "1", "5": "IC010", "26": "1", r: "25", s1A: "3000000", s2A: "1800000", s6A: "700000", m1A: "1200000", c1A: "5000", c5A: "15000" },
    filing: "2025-05-28", klass: "small",
    why: "A corporation's quarterly income tax return is Form 1702Q.",
    hints: ["Gross income (Item 5) is sales less cost of sales plus other taxable income.", "The MCIT uses the cumulative gross income of the quarters in Schedule 3.", "The tax due is the higher of the normal tax and the MCIT."],
    solution: ["Gross income (Items 3, 5) = ₱3,000,000 − ₱1,800,000 = ₱1,200,000. Taxable income this quarter (Item 7) = ₱1,200,000 − ₱700,000 = ₱500,000 = Item 9 (no previous quarter).", "Normal tax (Item 11) = 25% × ₱500,000 = ₱125,000. MCIT (Schedule 3 Item 6) = 2% × ₱1,200,000 = ₱24,000. Tax due (Item 13) = ₱125,000.", "Credits (Item 7 of Schedule 4) = ₱5,000 + ₱15,000 = ₱20,000. Net tax payable (Item 20) = ₱105,000. On time (due May 30, 2025): Item 25 = ₱105,000."],
  }),
  caseOf({
    form: "1702Q", level: "average", year: 2025, title: "Second quarter, cumulative at 20%",
    story: [
      "Luna Hardware Corp., San Jose City, Nueva Ecija 3121, uses the 20% rate (net taxable income under ₱5 million, assets under ₱100 million) and itemized deductions. Second quarter 2025 (April to June): sales ₱4,000,000, cost of sales ₱2,500,000, other income ₱20,000, deductions ₱1,300,000. Its first quarter showed gross income of ₱1,000,000 and taxable income of ₱150,000 (cumulative, tax paid ₱30,000).",
      "Credits: ₱30,000 paid with the first-quarter return, ₱4,000 creditable tax withheld in the first quarter, and ₱6,000 per the 2307s of this quarter. The return is due 60 days after June 30 and is filed on August 28, 2025, with two attachments. Fill in BIR Form 1702Q for the second quarter of 2025.",
    ],
    profile: P(802, "026", "LUNA HARDWARE CORP.", "BRGY. PORAIS, SAN JOSE CITY, NUEVA ECIJA", "3121"),
    facts: { ...common, "3": "2", "5": "IC010", "26": "2", r: "20", s1A: "4000000", s2A: "2500000", s4A: "20000", s6A: "1300000", s8A: "150000", m1A: "1000000", m2A: "1520000", c2A: "30000", c4A: "4000", c5A: "6000" },
    filing: "2025-08-28", klass: "small",
    why: "A corporation's quarterly income tax return is Form 1702Q.",
    hints: ["Add the taxable income of the previous quarter (Item 8) to reach the income to date.", "The MCIT adds the gross income of both quarters (₱1,000,000 + this quarter's total gross income).", "Credits for the previous quarter: payment (Item 2) and withholding (Item 4)."],
    solution: ["Gross income (Item 3) = ₱1,500,000; plus ₱20,000 = ₱1,520,000 (Item 5). Taxable income this quarter (Item 7) = ₱1,520,000 − ₱1,300,000 = ₱220,000. Plus ₱150,000 previous: Item 9 = ₱370,000.", "Normal tax (Item 11) = 20% × ₱370,000 = ₱74,000. MCIT = 2% × (₱1,000,000 + ₱1,520,000) = ₱50,400. Tax due (Item 13) = ₱74,000.", "Credits = ₱30,000 + ₱4,000 + ₱6,000 = ₱40,000. Net tax payable (Item 20) = ₱34,000. Due August 29, 2025: on time. Item 25 = ₱34,000."],
  }),
  caseOf({
    form: "1702Q", level: "difficult", year: 2025, title: "Third quarter: MCIT is higher, and late",
    story: [
      "Pangilinan Printing Corp., Gapan City, Nueva Ecija 3105, uses the 20% rate and itemized deductions. Third quarter 2025 (July to September): sales ₱1,800,000, cost of sales ₱1,300,000, deductions ₱480,000, no other income. Previous quarters' taxable income was ₱60,000. Gross income of the quarters: first ₱900,000, second ₱700,000, third this quarter.",
      "Credits: ₱1,000 excess from 2024, ₱12,000 MCIT payments of the previous quarters, ₱3,000 creditable tax withheld in previous quarters, ₱2,000 per the 2307s of this quarter.",
      "The return is due 60 days after September 30. It files and pays on December 20, 2025. As a small taxpayer the surcharge is 10% and interest 6% a year by the day over 365; the compromise assessed is ₱1,000. Three attachments. Fill in BIR Form 1702Q for the third quarter of 2025.",
    ],
    profile: P(803, "027", "PANGILINAN PRINTING CORP.", "BRGY. BULAK, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "3": "3", "5": "IC055", "26": "3", r: "20", s1A: "1800000", s2A: "1300000", s6A: "480000", s8A: "60000", m1A: "900000", m2A: "700000", m3A: "500000", c1A: "1000", c3A: "12000", c4A: "3000", c5A: "2000", "23A": "1000" },
    filing: "2025-12-20", klass: "small",
    why: "A corporation's quarterly income tax return is Form 1702Q. Late filing and MCIT do not change the form.",
    hints: ["Compare the normal tax on the income to date with the MCIT on the gross income of all three quarters.", "If the MCIT is the tax due, the ATC is IC 055.", "September 30 plus 60 days is November 29. Count the days to December 20."],
    solution: ["Gross income (Item 5) = ₱1,800,000 − ₱1,300,000 = ₱500,000. Taxable income this quarter (Item 7) = ₱500,000 − ₱480,000 = ₱20,000. Plus ₱60,000: Item 9 = ₱80,000.", "Normal tax (Item 11) = 20% × ₱80,000 = ₱16,000. MCIT = 2% × (₱900,000 + ₱700,000 + ₱500,000) = 2% × ₱2,100,000 = ₱42,000. Tax due (Item 13) = ₱42,000 (ATC IC 055).", "Credits = ₱1,000 + ₱12,000 + ₱3,000 + ₱2,000 = ₱18,000. Net tax payable (Item 20) = ₱24,000.", "Due November 29, 2025; filed December 20 = 21 days late. Surcharge = 10% × ₱24,000 = ₱2,400. Interest = ₱24,000 × 6% × 21 ÷ 365 = ₱82.85 → ₱83. Compromise ₱1,000. Total penalties = ₱3,483. Item 25 = ₱27,483."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1702Q: Quarterly Income Tax Return for corporations and other non-individuals", minutes: "About 8 minutes",
  sections: [
    ["1. Who files 1702Q", "Corporations, partnerships and other non-individual taxpayers file the quarterly income tax return for each of the first three quarters of the taxable year (calendar or fiscal). The annual return (1702-RT, 1702-EX or 1702-MX) takes the place of a fourth quarter. The quarterly return is due WITHIN 60 DAYS after the close of the quarter, with or without payment (per the form's Guidelines and Instructions): for a calendar year, 60 days after March 31, June 30 and September 30."],
    ["2. Cumulative declaration", "Like the individual 1701Q, the corporate quarterly computation is cumulative. Schedule 2 declares this quarter: sales less cost of sales gives gross income; add other taxable income; subtract deductions (itemized this quarter, or the 40% OSD) to get taxable income this quarter. Add the taxable income of the previous quarter(s) to get taxable income to date and multiply by the rate (25%, or 20% where the corporation qualifies; the lab's cases say which) to get the normal tax.", "Schedule 3 computes the MCIT: 2% of the gross income of all quarters to date (a cumulative base). The tax due is the HIGHER of the normal tax and the MCIT; if MCIT is the tax due, the ATC is IC 055. Schedule 4 lists the credits: prior year's excess, payments of previous quarters, MCIT payments of previous quarters, withholding of previous quarters, the 2307s of this quarter, and tax paid if amended."],
    ["3. Penalties", "A late quarterly return carries surcharge, interest and compromise on the net tax payable (Item 20): 25% and 12% a year in general, 10% and 6% for micro and small taxpayers (verify; see the rules file). Interest is counted by the day over 365."],
  ],
  worked: { intro: "A corporation (25%): first quarter taxable income ₱500,000; gross income ₱1,200,000; credits ₱20,000.", steps: ["Normal tax = 25% × ₱500,000 = ₱125,000; MCIT = 2% × ₱1,200,000 = ₱24,000. Tax due = ₱125,000.", "Net tax payable = ₱105,000."], title: "Form 1702Q", table: { "S2-9": "500,000", "S2-11": "125,000", "S3-6": "24,000", "S2-13": "125,000", "S4-7": "20,000", "20": "105,000" } },
  legal: ["NIRC Sec. 75 (quarterly declaration) and Sec. 27(E) (MCIT); BIR Form 1702Q January 2018 (ENCS) and its Guidelines and Instructions (filing within 60 days)."],
  guide: [
    ["1 to 5", "1", "Calendar or fiscal, year ended, quarter, amended, ATC.", "Your records.", "Wrong quarter."],
    ["6 to 13", "6", "TIN, RDO, name, address, contact, email, method of deductions, tax relief answer.", "COR.", "OSD with itemized."],
    ["S2 1 to 9", "s1A", "Sales, cost, other income, deductions, previous quarters' taxable income; computed totals.", "Books and last quarter.", "Forgetting Item 8."],
    ["S2 10 to 13", "s11A", "Rate, computed normal tax, MCIT, and the higher.", "Computed.", "Ignoring MCIT."],
    ["S3 1 to 6", "m1A", "Gross income of each quarter; the MCIT is computed.", "Earlier returns.", "Using only this quarter."],
    ["S4 1 to 7", "c1A", "Credits and total.", "Earlier returns, 2307s.", "Withholding in the wrong line."],
    ["14 to 25", "14A", "Computed totals; compromise typed; penalties from the filing date.", "Filing date.", "Penalty on the tax due."],
  ],
  checklist: ["Know the quarter and the 60-day deadline.", "Take Item 8 from the last return.", "Total the gross income per quarter for the MCIT.", "List payments and 2307s per quarter."],
  pitfalls: ["No MCIT comparison.", "Quarter-only MCIT.", "Rate 25% vs 20%.", "A fourth-quarter 1702Q (there is none)."],
  amended: "Tick Yes in Item 4 and enter the tax paid in the original return in Schedule 4 Item 6.",
  noPayment: "If the credits cover the tax, nothing is payable; the return is still due in 60 days.",
  quiz: [
    ["A calendar corporation's first quarter 1702Q is due:", ["April 15", "60 days after March 31", "July 15", "Dec 31"], 1, "Within 60 days after the close of the quarter."],
    ["The MCIT base in the quarterly return is:", ["Net income of the quarter", "Gross income of the quarters to date", "Sales", "Equity"], 1, "2% of the gross income of the quarters to date (Schedule 3)."],
    ["Normal tax ₱16,000; MCIT ₱42,000. Tax due?", ["₱16,000", "₱42,000", "₱58,000", "₱26,000"], 1, "The higher."],
    ["How many 1702Q are filed per year?", ["1", "2", "3", "4"], 2, "Three."],
    ["Taxable income previous quarter ₱150,000 goes to:", ["Schedule 2 Item 8", "Schedule 3 Item 1", "Part II Item 15", "Schedule 4 Item 1"], 0, "Schedule 2 Item 8."],
  ],
});
