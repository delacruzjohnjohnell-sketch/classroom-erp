// BIR Form 1702-EX, January 2018 (ENCS) v2: Annual Income Tax Return, Corporation, Partnership and Other Non-Individual Taxpayer EXEMPT.
// Item numbers follow docs/bir-forms/1702-EX-Jan-2018.pdf. Simplified: Part V (tax relief) and Schedules 2 and 3 (special deductions, reconciliation) are not simulated;
// Item 36 is typed as a total. ATCs on the form: IC 011 (exempt corporation on exempt activities) and IC 021 (General Professional Partnership); the cases use a GPP.
import { RULES } from "../rules/2026";
import { roundToPeso } from "../engine/tax";
import { f, fields, makeForm, opts, radio } from "../forms/kit";
import type { Issue } from "../forms/types";
import { CORP_REQUIRED, corpAnnualDue, corpIdentity, corpPerson, scheduleOrdinary } from "./corp";
import { caseOf, lessonOf } from "./kit";

export const DEF = makeForm({
  id: "1702-EX", number: "1702-EX", title: "Annual Income Tax Return", subtitle: "Corporation, Partnership and Other Non-Individual Taxpayer EXEMPT",
  version: "January 2018 (ENCS) v2", versionNote: "Official PDF: 1702-EX Jan 2018 ENCS v2. Due: 15th day of the 4th month after the close of the taxable year.",
  yearId: "2",
  identity: corpIdentity(opts(["IC011", "IC 011 Exempt Corporation on Exempt Activities"], ["IC021", "IC 021 General Professional Partnership"]), "Method of Deductions [OSD applicable only to General Professional Partnerships]", [
    fields(f("14", "14", "Legal Basis of Tax Relief/Exemption (specify)", "text", { span: 6 }), f("15", "15", "Investment Promotion Agency (IPA)/Government Agency (specify)", "text", { span: 6 })),
    fields(f("16", "16", "Registered Activity/Program (Registration Number)", "text", { span: 6 }), f("17", "17", "Effectivity Date of Tax Relief/Exemption (MM/DD/YYYY)", "date", { span: 6 })),
    fields(f("23", "23", "Number of Attachments", "count", { span: 3, required: true })),
    fields(f("OV", "Overpayment", "If overpayment, mark one box only (irrevocable)", "radio", { span: 12, options: opts(["refund", "To be refunded"], ["tcc", "To be issued a Tax Credit Certificate (TCC)"], ["carry", "To be carried over as a tax credit for next year/quarter"]) })),
  ]),
  required: [...CORP_REQUIRED, { id: "23", message: "Enter the number of attachments (0 if none)." }],
  formats: { tin: ["6"], rdo: ["7"], zip: ["9A"], email: ["12"] },
  sections: [
    { id: "p2", title: "Part II – Total Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "18", item: "18", label: "Tax Due (From Part IV Item 41)", f: (c) => c.n("41") },
      { id: "19", item: "19", label: "Less: Total Tax Credits/Payments (From Part IV Item 50)", f: (c) => c.n("50") },
      { id: "20", item: "20", label: "Total (Overpayment) (Item 18 Less Item 19) (From Part IV Item 51)", f: (c) => c.n("18") - c.n("19"), bold: true, key: true },
      { id: "21", item: "21", label: "Add: Penalty - Compromise" },
      { id: "22", item: "22", label: "TOTAL AMOUNT PAYABLE / (Overpayment) (Sum of Items 20 and 21)", f: (c) => c.n("20") + c.n("21"), bold: true, key: true },
    ] },
    { id: "p4", title: "Part IV – Computation of Tax", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "28", item: "28", label: "Sales/Receipts/Revenues/Fees" },
      { id: "29", item: "29", label: "Less: Sales Returns, Allowances and Discounts" },
      { id: "30", item: "30", label: "Net Sales/Receipts/Revenues/Fees (Item 28 Less Item 29)", f: (c) => c.n("28") - c.n("29") },
      { id: "31", item: "31", label: "Less: Cost of Sales/Services" },
      { id: "32", item: "32", label: "Gross Income from Operation (Item 30 Less Item 31)", f: (c) => c.n("30") - c.n("31") },
      { id: "33", item: "33", label: "Add: Other Income" },
      { id: "34", item: "34", label: "Total Gross Income (Sum of Items 32 and 33)", f: (c) => c.n("32") + c.n("33"), bold: true, key: true },
      { id: "35", item: "35", label: "Ordinary Allowable Itemized Deductions (From Part VI Schedule 1 Item 18)", f: (c) => c.n("k18"), indent: 1 },
      { id: "36", item: "36", label: "Special Allowable Itemized Deductions (From Part VI Schedule 2 Item 5)", indent: 1 },
      { id: "37", item: "37", label: "Total Itemized Deductions (Sum of Items 35 and 36)", f: (c) => (c.text("13") === "osd" ? 0 : c.n("35") + c.n("36")) },
      { id: "38", item: "38", label: "OSD (40% of Item 34) (applicable only to GPP per RA No. 10963)", f: (c) => (c.text("13") === "osd" ? roundToPeso(Math.round(Math.max(c.n("34"), 0) * RULES.osd.rate)) : 0) },
      { id: "39", item: "39", label: "Net Taxable Income/(Loss) (If Itemized: Item 34 Less Item 37; If OSD: Item 34 Less Item 38)", f: (c) => (c.text("13") === "osd" ? c.n("34") - c.n("38") : c.n("34") - c.n("37")), key: true },
      { id: "41", item: "41", label: "Tax Due (Item 39 x Item 40) (To Part II Item 18)", f: (c) => (c.n("39") > 0 ? roundToPeso(Math.round(c.n("39") * ((Number(c.text("40")) || 0) / 100))) : 0), bold: true, key: true },
      { heading: "Tax Credits/Payments (attach proof)" },
      { id: "42", item: "42", label: "Prior Year's Excess Credits", indent: 1 },
      { id: "43", item: "43", label: "Income Tax Payment from Previous Quarter/s", indent: 1 },
      { id: "44", item: "44", label: "Creditable Tax Withheld from Previous Quarter/s per BIR Form No. 2307", indent: 1 },
      { id: "45", item: "45", label: "Creditable Tax Withheld per BIR Form No. 2307 for the 4th Quarter", indent: 1 },
      { id: "46", item: "46", label: "Foreign Tax Credits, if applicable", indent: 1 },
      { id: "47", item: "47", label: "Tax Paid in Return Previously Filed, if this is an Amended Return", indent: 1 },
      { id: "48", item: "48", label: "Other Tax Credits/Payments (specify)", indent: 1, specify: true },
      { id: "50", item: "50", label: "Total Tax Credits/Payments (Sum of Items 42 to 49) (To Part II Item 19)", f: (c) => ["42", "43", "44", "45", "46", "47", "48"].reduce((a, id) => a + c.n(id), 0), bold: true },
      { id: "51", item: "51", label: "Total (Overpayment) (Item 41 Less Item 50) (To Part II Item 20)", f: (c) => c.n("41") - c.n("50"), bold: true },
    ] },
    { id: "s1", title: "Part VI – Schedule 1: Ordinary Allowable Itemized Deductions", lines: scheduleOrdinary() },
  ],
  split: 1,
  due: corpAnnualDue,
  extraValidate: (v, _ctx, computed) => {
    const out: Issue[] = [];
    if (!v["40"]) out.push({ id: "40", item: "40", message: "Enter the tax rate (0% for an exempt entity)." });
    if (v["13"] === "osd" && v["5"] !== "IC021") out.push({ id: "13", item: "13", message: "The OSD is applicable only to a General Professional Partnership." });
    if (v["3"] === "yes" && !(Number(v["47A"]) > 0)) out.push({ id: "47A", item: "47", message: "This is an amended return: enter the tax paid in the return previously filed (Item 47)." });
    if (Number(computed["20A"] ?? 0) < 0 && !v["OV"]) out.push({ id: "OV", item: "Overpayment", message: "There is an overpayment: mark one box (refund, TCC or carry over)." });
    return out;
  },
  scoreExtra: [{ id: "13", weight: 2 }, { id: "40", weight: 2 }],
});
DEF.pages[1].sections[0].rows.splice(DEF.pages[1].sections[0].rows.findIndex((r) => r.type === "amounts" && r.id === "41"), 0, radio("40", "40", "Tax Rate", opts(["0", "0% (exempt)"], ["20", "20%"], ["25", "25%"]), { span: 12 }));

const common = { "1": "calendar", "2": "12/2025", "3": "no", "4": "no", "5": "IC021", "40": "0" } as const;

export const CASES = [
  caseOf({
    form: "1702-EX", level: "easy", year: 2025, title: "A law partnership (GPP) with itemized deductions",
    story: [
      "Dela Cruz & Ramos Law Offices is a general professional partnership (GPP) in Cabanatuan City. A GPP is exempt from income tax as an entity; its partners are taxed on their shares. It uses itemized deductions and the tax rate is 0%.",
      "2025: professional fees ₱4,000,000 (no returns, no cost of services). Ordinary deductions: salaries ₱2,000,000 and rental ₱400,000. Creditable tax withheld by clients: ₱120,000 per the 2307s of the first three quarters and ₱30,000 per the 2307s of the fourth quarter. No tax paid with quarterly returns.",
      "It files on April 10, 2026 with two attachments, and chooses to carry over the overpayment as a tax credit. Fill in BIR Form 1702-EX for the year ended 12/2025.",
    ],
    profile: corpPerson(601, "025", "DELA CRUZ & RAMOS LAW OFFICES", "BRGY. SANGITAN, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "13": "itemized", "23": "2", OV: "carry", "28A": "4000000", k13A: "2000000", k11A: "400000", "44A": "120000", "45A": "30000" },
    filing: "2026-04-10",
    why: "A general professional partnership is exempt from income tax, so it files the exempt return, Form 1702-EX.",
    hints: ["The tax rate is 0%, so the tax due is zero even though there is net taxable income.", "Creditable tax withheld goes to Items 44 and 45.", "A negative Item 51 is an overpayment: mark one box."],
    solution: ["Total gross income (Item 34) = ₱4,000,000. Ordinary deductions (Item 35) = ₱2,400,000. Net taxable income (Item 39) = ₱1,600,000 (it passes to the partners).", "Tax due (Item 41) = 0% × ₱1,600,000 = ₱0.", "Credits (Item 50) = ₱120,000 + ₱30,000 = ₱150,000. Overpayment (Item 51 = Item 20) = (₱150,000). Item 22 = (₱150,000)."],
  }),
  caseOf({
    form: "1702-EX", level: "average", year: 2025, title: "A GPP using the OSD, claiming a refund",
    story: [
      "Reyes Santos Accountants is a GPP in San Jose City. It elects the optional standard deduction (40% of gross income), which is allowed only for GPPs.",
      "2025: professional fees ₱3,000,000 and ₱100,000 other income. Credits: ₱10,000 excess from 2024, ₱60,000 per the 2307s of the first three quarters and ₱20,000 for the fourth quarter. It asks for a refund of the overpayment. Files April 14, 2026 with three attachments.",
    ],
    profile: corpPerson(602, "026", "REYES SANTOS ACCOUNTANTS", "BRGY. CALAOCAN, SAN JOSE CITY, NUEVA ECIJA", "3121"),
    facts: { ...common, "13": "osd", "23": "3", OV: "refund", "28A": "3000000", "33A": "100000", "42A": "10000", "44A": "60000", "45A": "20000" },
    filing: "2026-04-14",
    why: "A GPP files Form 1702-EX. The OSD is available only to a GPP.",
    hints: ["The OSD is 40% of Item 34 (total gross income, including other income).", "No itemized deductions are filled in when the OSD is used.", "Prior year excess credits go to Item 42."],
    solution: ["Total gross income (Item 34) = ₱3,000,000 + ₱100,000 = ₱3,100,000. OSD (Item 38) = 40% × ₱3,100,000 = ₱1,240,000. Net taxable income (Item 39) = ₱1,860,000.", "Tax due (Item 41) = 0% × ₱1,860,000 = ₱0.", "Credits (Item 50) = ₱10,000 + ₱60,000 + ₱20,000 = ₱90,000. Overpayment = (₱90,000); refund."],
  }),
  caseOf({
    form: "1702-EX", level: "difficult", year: 2025, title: "A GPP filing late: only the compromise applies",
    story: [
      "Pascual Engineers Consulting is a GPP in Gapan City using itemized deductions. 2025: fees ₱6,000,000 less ₱200,000 discounts, no cost of services, other income ₱50,000. Ordinary deductions: salaries ₱2,500,000, rental ₱600,000, depreciation ₱150,000, taxes and licenses ₱100,000, other expenses ₱650,000 (specify PROFESSIONAL FEES); special allowable deductions ₱100,000.",
      "Credits: ₱15,000 excess from 2024, ₱200,000 per the 2307s of the first three quarters, ₱50,000 for the fourth quarter. It carries the overpayment over.",
      "It files on May 30, 2026, after the April 15 due date. Because no tax is due there is no surcharge or interest; the RDO assessed a compromise penalty of ₱2,000 (Item 21). Four attachments. Fill in BIR Form 1702-EX for the year ended 12/2025.",
    ],
    profile: corpPerson(603, "027", "PASCUAL ENGINEERS CONSULTING", "BRGY. PAMBUAN, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "13": "itemized", "23": "4", OV: "carry", "28A": "6000000", "29A": "200000", "33A": "50000", k13A: "2500000", k11A: "600000", k5A: "150000", k15A: "100000", k17A: "650000", k17S: "PROFESSIONAL FEES", "36A": "100000", "42A": "15000", "44A": "200000", "45A": "50000", "21A": "2000" },
    filing: "2026-05-30",
    why: "A GPP files Form 1702-EX even when late; the form has only a compromise line for penalties.",
    hints: ["Item 32 is net sales less cost; add other income for Item 34.", "Item 37 is ordinary plus special deductions.", "The compromise (Item 21) is added to the overpayment in Item 22."],
    solution: ["Net sales (Item 30) = ₱5,800,000. Total gross income (Item 34) = ₱5,850,000. Ordinary deductions (Item 35) = ₱4,000,000; special ₱100,000; total (Item 37) = ₱4,100,000. Net taxable income (Item 39) = ₱1,750,000.", "Tax due = 0. Credits (Item 50) = ₱15,000 + ₱200,000 + ₱50,000 = ₱265,000. Overpayment (Item 20) = (₱265,000).", "Compromise (Item 21) = ₱2,000. Total (Item 22) = (₱265,000) + ₱2,000 = (₱263,000)."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1702-EX: Annual Income Tax Return for exempt non-individual taxpayers", minutes: "About 6 minutes",
  sections: [
    ["1. Who files 1702-EX", "Non-individual taxpayers that are exempt from income tax under the Tax Code or special laws, and that have no other taxable income, file Form 1702-EX. A common example in class is the general professional partnership (GPP): the partnership itself is not taxed, and each partner reports and pays tax on his or her distributive share. An exempt entity that also has taxable income uses Form 1702-MX. The form exists so the BIR can see the entity's gross income, deductions, credits and the legal basis of the exemption."],
    ["2. The computation", "Compute total gross income (Item 34), then subtract itemized deductions (ordinary from Schedule 1, special) or, for a GPP only, the OSD of 40% of Item 34. The net taxable income (Item 39) is multiplied by the tax rate in Item 40, which is 0% for an exempt entity, so the tax due is zero. The credits (prior year's excess, quarterly payments, creditable tax withheld per Form 2307) then create an overpayment, for which exactly one irrevocable choice is marked: refund, tax credit certificate (TCC) or carry over."],
    ["3. Deadline and penalty", "The annual return is due on or before the 15th day of the 4th month after the close of the taxable year, whether or not there is a payment. With no tax due there is no surcharge or interest, and the only penalty line is the compromise (Item 21), added to the overpayment in Item 22."],
  ],
  worked: { intro: "A GPP earns ₱2,000,000 and spends ₱1,200,000 (itemized). ₱60,000 was withheld by clients.", steps: ["Net taxable income = ₱800,000; tax at 0% = ₱0.", "Credits ₱60,000; overpayment (₱60,000)."], title: "Form 1702-EX", table: { "34": "2,000,000", "37": "1,200,000", "39": "800,000", "41": "0", "50": "60,000", "51": "(60,000)" } },
  legal: ["NIRC Sec. 26 (partnerships exempt: general professional partnerships), Sec. 30 (exempt organizations); Sec. 34(L) as amended by RA 10963 (OSD for GPPs); Sec. 52 (return); BIR Form 1702-EX January 2018 (ENCS) v2."],
  guide: [
    ["1 to 5", "1", "Calendar or fiscal, year ended, amended, short period, ATC (IC 021 for a GPP).", "Your books.", "Wrong ATC."],
    ["6 to 13", "6", "TIN, RDO, name, address, incorporation date, contact, email, method of deductions.", "COR.", "OSD for a non-GPP."],
    ["14 to 17", "14", "Legal basis of the exemption, agency, registered activity, effectivity date (as applicable).", "Registration papers.", "Leaving the legal basis blank when claiming relief."],
    ["28 to 34", "28A", "Fees, returns, cost, other income; computed gross income.", "Books.", "Final-taxed income."],
    ["35 to 39", "35A", "Computed ordinary deductions; special deductions (typed); total or OSD; net taxable income.", "Schedule 1.", "OSD plus itemized."],
    ["40 and 41", "40", "Tax rate (0% exempt) and the computed tax due.", "Exemption.", "Applying 25% to a GPP."],
    ["42 to 51", "42A", "Credits and the overpayment.", "2307s, quarterly returns.", "Missing the 4th quarter 2307."],
    ["18 to 22", "18A", "Computed totals; compromise typed; total payable or overpayment.", "RDO assessment.", "Ignoring the compromise."],
  ],
  checklist: ["Confirm the entity is exempt (GPP, etc.).", "Get the 2307s by quarter.", "Pick OSD only if GPP.", "Decide the overpayment option."],
  pitfalls: ["Treating a GPP as taxable.", "OSD by a non-GPP.", "Two overpayment boxes.", "Missing the legal basis."],
  amended: "Tick Yes in Item 3 and enter the tax paid in the original return in Item 47.",
  noPayment: "The return is due even with no tax or with an overpayment.",
  quiz: [
    ["A general professional partnership pays income tax:", ["25% as an entity", "None as an entity; the partners are taxed", "20% as an entity", "2% MCIT"], 1, "A GPP is exempt as an entity; partners are taxed on their shares."],
    ["The OSD on Form 1702-EX applies:", ["To all exempt entities", "Only to a GPP", "To cooperatives only", "To nobody"], 1, "Per the form: applicable only to GPP."],
    ["GPP income ₱2,000,000, OSD. Net taxable income?", ["₱800,000", "₱1,200,000", "₱2,000,000", "₱0"], 1, "40% × 2,000,000 = 800,000; 2,000,000 − 800,000 = 1,200,000."],
    ["Credits ₱50,000 exceed tax ₱0. How many overpayment boxes?", ["None", "One", "Two", "Three"], 1, "Exactly one, irrevocable."],
    ["When is the annual return due for a calendar-year entity?", ["Jan 31", "April 15", "June 30", "Dec 31"], 1, "15th day of the 4th month after year end."],
  ],
});
