// BIR Form 1702-RT, January 2018 (ENCS): Annual Income Tax Return, Corporation, Partnership and Other Non-Individual Taxpayer subject only to REGULAR income tax rate.
// Item numbers follow docs/bir-forms/1702-RT-Jan-2018.pdf. Simplified: Part V (tax relief), Schedules II to IV (special deductions, NOLCO and MCIT detail) are not simulated;
// Items 35 and 36 are typed as totals. Schedule I lines are ids k1..k17 (the form numbers them 1 to 17).
import { RULES } from "../rules/2026";
import { roundToPeso } from "../engine/tax";
import { f, fields, makeForm, opts, radio } from "../forms/kit";
import type { Issue } from "../forms/types";
import { CORP_REQUIRED, corpAnnualDue, corpIdentity, corpPerson, scheduleOrdinary } from "./corp";
import { caseOf, lessonOf } from "./kit";

const ATC = opts(["IC010", "IC 010 Domestic Corporation - In General"], ["IC055", "IC 055 Minimum Corporate Income Tax (MCIT)"]);
const rate = (t: string) => (Number(t) || 0) / 100;

export const DEF = makeForm({
  id: "1702-RT", number: "1702-RT", title: "Annual Income Tax Return", subtitle: "Corporation, Partnership and Other Non-Individual Taxpayer Subject Only to REGULAR Income Tax Rate",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 1702-RT Jan 2018 ENCS Final v3. Due: 15th day of the 4th month after the close of the taxable year (BIR forms page for 1702-RT).",
  yearId: "2",
  identity: [
    ...corpIdentity(ATC, "Method of Deductions", [
      fields(f("22", "22", "Number of Attachments", "count", { span: 3, required: true })),
      fields(f("OV", "Overpayment", "If overpayment, mark one box only (irrevocable)", "radio", { span: 12, options: opts(["refund", "To be refunded"], ["tcc", "To be issued a Tax Credit Certificate (TCC)"], ["carry", "To be carried over as a tax credit for next year/quarter"]) })),
    ]),
  ],
  required: [...CORP_REQUIRED, { id: "22", message: "Enter the number of attachments (0 if none)." }],
  formats: { tin: ["6"], rdo: ["7"], zip: ["9A"], email: ["12"] },
  sections: [
    { id: "p2", title: "Part II – Total Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "14", item: "14", label: "Tax Due (From Part IV Item 43)", f: (c) => c.n("43") },
      { id: "15", item: "15", label: "Less: Total Tax Credits/Payments (From Part IV Item 55)", f: (c) => c.n("55") },
      { id: "16", item: "16", label: "Net Tax Payable / (Overpayment) (Item 14 Less Item 15)", f: (c) => c.n("14") - c.n("15"), bold: true, key: true },
      { heading: "Add: Penalties" },
      { id: "17", item: "17", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "18", item: "18", label: "Interest", f: () => 0, indent: 1 },
      { id: "19", item: "19", label: "Compromise", indent: 1 },
      { id: "20", item: "20", label: "Total Penalties (Sum of Items 17 to 19)", f: () => 0 },
      { id: "21", item: "21", label: "TOTAL AMOUNT PAYABLE / (Overpayment) (Sum of Items 16 and 20)", f: () => 0, bold: true, key: true },
    ] },
    { id: "p4", title: "Part IV – Computation of Tax", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "27", item: "27", label: "Sales/Receipts/Revenues/Fees" },
      { id: "28", item: "28", label: "Less: Sales Returns, Allowances and Discounts" },
      { id: "29", item: "29", label: "Net Sales/Receipts/Revenues/Fees (Item 27 Less Item 28)", f: (c) => c.n("27") - c.n("28") },
      { id: "30", item: "30", label: "Less: Cost of Sales/Services" },
      { id: "31", item: "31", label: "Gross Income from Operation (Item 29 Less Item 30)", f: (c) => c.n("29") - c.n("30") },
      { id: "32", item: "32", label: "Add: Other Taxable Income Not Subjected to Final Tax" },
      { id: "33", item: "33", label: "Total Taxable Income (Sum of Items 31 and 32)", f: (c) => c.n("31") + c.n("32"), bold: true, key: true },
      { heading: "Less: Deductions Allowable under Existing Law" },
      { id: "34", item: "34", label: "Ordinary Allowable Itemized Deductions (From Part VI Schedule I Item 18)", f: (c) => c.n("k18"), indent: 1 },
      { id: "35", item: "35", label: "Special Allowable Itemized Deductions (From Part VI Schedule II Item 5)", indent: 1 },
      { id: "36", item: "36", label: "NOLCO (From Part VI Schedule III Item 8)", indent: 1 },
      { id: "37", item: "37", label: "Total Deductions (Sum of Items 34 to 36)", f: (c) => (c.text("13") === "osd" ? 0 : c.n("34") + c.n("35") + c.n("36")) },
      { id: "38", item: "38", label: "OR Optional Standard Deduction (OSD) (40% of Item 33)", f: (c) => (c.text("13") === "osd" ? roundToPeso(Math.round(Math.max(c.n("33"), 0) * RULES.osd.rate)) : 0) },
      { id: "39", item: "39", label: "Net Taxable Income/(Loss) (If Itemized: Item 33 Less Item 37; If OSD: Item 33 Less Item 38)", f: (c) => (c.text("13") === "osd" ? c.n("33") - c.n("38") : c.n("33") - c.n("37")), key: true },
      { id: "41", item: "41", label: "Income Tax Due other than Minimum Corporate Income Tax (MCIT) (Item 39 x Item 40)", f: (c) => (c.n("39") > 0 ? roundToPeso(Math.round(c.n("39") * rate(c.text("40")))) : 0), key: true },
      { id: "42", item: "42", label: "MCIT Due (2% of Item 33)", f: (c) => (c.n("33") > 0 ? roundToPeso(Math.round(c.n("33") * RULES.mcit.rate)) : 0), key: true },
      { id: "43", item: "43", label: "Tax Due (Normal Income Tax Due in Item 41 OR the MCIT Due in Item 42, whichever is higher) (To Part II Item 14)", f: (c) => Math.max(c.n("41"), c.n("42")), bold: true, key: true },
      { heading: "Less: Tax Credits/Payments (attach proof)" },
      { id: "44", item: "44", label: "Prior Year's Excess Credits other than MCIT", indent: 1 },
      { id: "45", item: "45", label: "Income Tax Payment under MCIT from Previous Quarter/s", indent: 1 },
      { id: "46", item: "46", label: "Income Tax Payment under Regular/Normal Rate from Previous Quarter/s", indent: 1 },
      { id: "47", item: "47", label: "Excess MCIT Applied this Current Taxable Year (From Schedule IV Item 4)", indent: 1 },
      { id: "48", item: "48", label: "Creditable Tax Withheld from Previous Quarter/s per BIR Form No. 2307", indent: 1 },
      { id: "49", item: "49", label: "Creditable Tax Withheld per BIR Form No. 2307 for the 4th Quarter", indent: 1 },
      { id: "50", item: "50", label: "Foreign Tax Credits, if applicable", indent: 1 },
      { id: "51", item: "51", label: "Tax Paid in Return Previously Filed, if this is an Amended Return", indent: 1 },
      { id: "52", item: "52", label: "Special Tax Credits", indent: 1 },
      { id: "53", item: "53", label: "Other Tax Credits/Payments (specify)", indent: 1, specify: true },
      { id: "55", item: "55", label: "Total Tax Credits/Payments (Sum of Items 44 to 54) (To Part II Item 15)", f: (c) => ["44", "45", "46", "47", "48", "49", "50", "51", "52", "53"].reduce((a, id) => a + c.n(id), 0), bold: true },
      { id: "56", item: "56", label: "Net Tax Payable / (Overpayment) (Item 43 Less Item 55) (To Part II Item 16)", f: (c) => c.n("43") - c.n("55"), bold: true },
    ] },
    { id: "s1", title: "Part VI – Schedule I: Ordinary Allowable Itemized Deductions", lines: scheduleOrdinary() },
  ],
  split: 1,
  penalty: { base: "16", surcharge: "17", interest: "18", compromise: "19", total: "20", grand: "21", cols: ["A"], gross: (c) => c.n("29") },
  due: corpAnnualDue,
  extraValidate: (v, _ctx, computed) => {
    const out: Issue[] = [];
    const bad = (id: string, item: string, message: string) => out.push({ id, item, message });
    if (!v["40"]) bad("40", "40", "Enter the applicable income tax rate (25%, or 20% for a corporation within the reduced-rate limits).");
    if (v["40"] === "20" && Number(computed["39A"] ?? 0) > RULES.corporate.reducedNetTaxableCeiling) bad("40", "40", "The 20% rate is only for a corporation whose net taxable income is P5,000,000 or less (and total assets, excluding land, P100,000,000 or less).");
    const mcitHigher = Number(computed["42A"] ?? 0) > Number(computed["41A"] ?? 0);
    if (v["5"] && mcitHigher && v["5"] !== "IC055") bad("5", "5", "The MCIT in Item 42 is higher than the normal income tax, so the ATC is IC 055 (MCIT).");
    if (v["5"] === "IC055" && !mcitHigher) bad("5", "5", "ATC IC 055 is for when the MCIT is the tax due; here the normal income tax is higher (use IC 010).");
    if (v["3"] === "yes" && !(Number(v["51A"]) > 0)) bad("51A", "51", "This is an amended return: enter the tax paid in the return previously filed (Item 51).");
    if (Number(computed["16A"] ?? 0) < 0 && !v["OV"]) bad("OV", "Overpayment", "There is an overpayment: mark one box (refund, TCC or carry over).");
    return out;
  },
  scoreExtra: [{ id: "5", weight: 2 }, { id: "13", weight: 2 }, { id: "40", weight: 2 }],
});
// The tax-rate box (Item 40) is a field, so add it to page 2's computation by inserting it before Item 41 in the form definition.
DEF.pages[1].sections[0].rows.splice(DEF.pages[1].sections[0].rows.findIndex((r) => r.type === "amounts" && r.id === "41"), 0, radio("40", "40", "Applicable Income Tax Rate", opts(["25", "25%"], ["20", "20%"]), { span: 12 }));

const common = { "1": "calendar", "2": "12/2025", "3": "no", "4": "no" } as const;

export const CASES = [
  caseOf({
    form: "1702-RT", level: "easy", year: 2025, title: "A trading corporation at the regular 25% rate",
    story: [
      "Gapan Rice Traders, Inc. is a domestic corporation in Gapan City, Nueva Ecija 3105 (calendar year, itemized deductions). Its total assets are over ₱100 million, so the regular 25% rate applies, not the 20% reduced rate.",
      "2025: sales ₱8,000,000 with no returns; cost of sales ₱5,000,000; other taxable income not subject to final tax ₱100,000. Ordinary deductions: salaries ₱1,000,000, rental ₱300,000, depreciation ₱200,000, taxes and licenses ₱100,000. It paid ₱150,000 with its first three quarterly returns, has creditable tax withheld (2307s) of ₱40,000 for the first three quarters and ₱10,000 for the fourth quarter.",
      "It files and pays on April 14, 2026 with two attachments. Compare the normal income tax with the MCIT and use the higher. Fill in BIR Form 1702-RT for the year ended 12/2025.",
    ],
    profile: corpPerson(501, "027", "GAPAN RICE TRADERS, INC.", "BRGY. MABUHAY, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "5": "IC010", "13": "itemized", "22": "2", "40": "25", "27A": "8000000", "30A": "5000000", "32A": "100000", k13A: "1000000", k11A: "300000", k5A: "200000", k15A: "100000", "46A": "150000", "48A": "40000", "49A": "10000" },
    filing: "2026-04-14", klass: "small",
    why: "A domestic corporation subject only to the regular income tax rate files Form 1702-RT.",
    hints: ["Item 33 is gross income from operation plus other taxable income. The MCIT is 2% of Item 33.", "Item 43 is the HIGHER of the normal tax (Item 41) and the MCIT (Item 42).", "Credits: the quarterly payments go to Item 46; the 2307s of the first three quarters to Item 48 and of the fourth quarter to Item 49."],
    solution: ["Net sales (Item 29) = ₱8,000,000. Gross income from operation (Item 31) = ₱3,000,000. Total taxable income / gross income (Item 33) = ₱3,100,000.", "Ordinary deductions (Item 34) = ₱1,000,000 + ₱300,000 + ₱200,000 + ₱100,000 = ₱1,600,000. Net taxable income (Item 39) = ₱3,100,000 − ₱1,600,000 = ₱1,500,000.", "Normal tax (Item 41) = 25% × ₱1,500,000 = ₱375,000. MCIT (Item 42) = 2% × ₱3,100,000 = ₱62,000. Tax due (Item 43) = ₱375,000 (the higher; ATC IC 010).", "Credits (Item 55) = ₱150,000 + ₱40,000 + ₱10,000 = ₱200,000. Net tax payable (Item 56) = ₱175,000. On time: Item 21 = ₱175,000."],
  }),
  caseOf({
    form: "1702-RT", level: "average", year: 2025, title: "A corporation where the MCIT is higher",
    story: [
      "Cuyapo Lumber Corp., a domestic corporation in Barangay Rizal, San Jose City, Nueva Ecija 3121, has total assets of ₱60 million and net taxable income under ₱5 million, so it uses the 20% rate. It uses itemized deductions.",
      "2025: sales ₱6,000,000 (no returns), cost of sales ₱1,000,000, no other income. Ordinary deductions: salaries ₱2,000,000, rental ₱600,000, depreciation ₱500,000, taxes and licenses ₱300,000, others ₱1,400,000 (specify PROFESSIONAL FEES). Credits: ₱5,000 excess credit from 2024, ₱20,000 paid with the first three quarterly returns, ₱8,000 per the 2307s of the fourth quarter.",
      "It files on April 15, 2026 with three attachments. The MCIT applies if it exceeds the normal tax. Fill in BIR Form 1702-RT for the year ended 12/2025.",
    ],
    profile: corpPerson(502, "026", "CUYAPO LUMBER CORP.", "BRGY. RIZAL, SAN JOSE CITY, NUEVA ECIJA", "3121"),
    facts: { ...common, "5": "IC055", "13": "itemized", "22": "3", "40": "20", "27A": "6000000", "30A": "1000000", k13A: "2000000", k11A: "600000", k5A: "500000", k15A: "300000", k17A: "1400000", k17S: "PROFESSIONAL FEES", "44A": "5000", "46A": "20000", "49A": "8000" },
    filing: "2026-04-15", klass: "small",
    why: "A domestic corporation with only regular-rate income files Form 1702-RT; the MCIT is part of this same form.",
    hints: ["Net taxable income is small. Compute both Item 41 and Item 42.", "If the MCIT is the tax due, the ATC is IC 055.", "Prior year excess credits go to Item 44."],
    solution: ["Gross income (Items 31, 33) = ₱6,000,000 − ₱1,000,000 = ₱5,000,000. Ordinary deductions (Item 34) = ₱2,000,000 + ₱600,000 + ₱500,000 + ₱300,000 + ₱1,400,000 = ₱4,800,000. Net taxable income (Item 39) = ₱200,000.", "Normal tax (Item 41) = 20% × ₱200,000 = ₱40,000. MCIT (Item 42) = 2% × ₱5,000,000 = ₱100,000. Tax due (Item 43) = ₱100,000 (MCIT; ATC IC 055).", "Credits (Item 55) = ₱5,000 + ₱20,000 + ₱8,000 = ₱33,000. Net tax payable (Item 56) = ₱67,000. Item 21 = ₱67,000."],
  }),
  caseOf({
    form: "1702-RT", level: "difficult", year: 2025, title: "OSD, the 20% rate, and a late return",
    story: [
      "Nueva Ecija Hardware Supply Corp., a domestic corporation in Barangay Burgos, Cabanatuan City, Nueva Ecija 3100, qualifies for the 20% rate (net taxable income under ₱5 million, assets under ₱100 million). It elects the optional standard deduction (OSD).",
      "2025: sales ₱9,000,000, less ₱500,000 returns and discounts; cost of sales ₱2,500,000; no other income. Credits: ₱20,000 excess from 2024, ₱300,000 paid with the first three quarterly returns, ₱40,000 and ₱15,000 creditable tax withheld per the 2307s of the first three quarters and of the fourth quarter.",
      "It files and pays on May 29, 2026, 44 days after April 15. As a small taxpayer (net sales under ₱20 million) the surcharge is 10% and interest 6% a year by the day over 365; the RDO assessed ₱5,000 compromise (enter it as given). Four attachments. Fill in BIR Form 1702-RT for the year ended 12/2025.",
    ],
    profile: corpPerson(503, "025", "NUEVA ECIJA HARDWARE SUPPLY CORP.", "BRGY. BURGOS, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "5": "IC010", "13": "osd", "22": "4", "40": "20", "27A": "9000000", "28A": "500000", "30A": "2500000", "44A": "20000", "46A": "300000", "48A": "40000", "49A": "15000", "19A": "5000" },
    filing: "2026-05-29", klass: "small",
    why: "A domestic corporation with only regular-rate income, even with OSD and a late filing, files Form 1702-RT.",
    hints: ["OSD is 40% of Item 33 (gross income), so there are no Schedule I deductions.", "Compare the normal tax (20% of Item 39) with the MCIT (2% of Item 33).", "April 15 to May 29, 2026 is 44 days. Penalties are computed on Item 16."],
    solution: ["Net sales (Item 29) = ₱8,500,000. Gross income (Items 31, 33) = ₱6,000,000. OSD (Item 38) = 40% × ₱6,000,000 = ₱2,400,000. Net taxable income (Item 39) = ₱3,600,000.", "Normal tax (Item 41) = 20% × ₱3,600,000 = ₱720,000. MCIT (Item 42) = 2% × ₱6,000,000 = ₱120,000. Tax due (Item 43) = ₱720,000.", "Credits (Item 55) = ₱20,000 + ₱300,000 + ₱40,000 + ₱15,000 = ₱375,000. Net tax payable (Item 16) = ₱345,000.", "Surcharge (Item 17) = 10% × ₱345,000 = ₱34,500. Interest (Item 18) = ₱345,000 × 6% × 44 ÷ 365 = ₱2,495.34, rounded to ₱2,495. Compromise ₱5,000. Total penalties (Item 20) = ₱41,995. Item 21 = ₱386,995."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1702-RT: Annual Income Tax Return for corporations subject only to the regular rate", minutes: "About 9 minutes",
  sections: [
    ["1. Who files 1702-RT", "Form 1702-RT is the annual income tax return of a corporation, partnership (other than a general professional partnership) or other non-individual taxpayer that is subject ONLY to the regular income tax rate. If the entity is exempt, use 1702-EX; if it has a mix of regular and exempt or special-rate income, use 1702-MX. The ATC on the form is IC 010 (domestic corporation in general) or IC 055 when the minimum corporate income tax (MCIT) is the tax due."],
    ["2. The computation", "Start with sales, less returns and discounts (net sales), less cost of sales: gross income from operation. Add other taxable income not subject to final tax: this is Item 33 'Total Taxable Income', which is also the gross income used for the MCIT. Subtract either the itemized deductions (ordinary deductions from Schedule I, special deductions, NOLCO) or the optional standard deduction of 40% of Item 33. The result is the net taxable income (Item 39), and the normal tax is Item 39 times the rate (Item 40).", "Alongside, compute the MCIT, which is 2% of Item 33 (printed on the form). The tax due is whichever is higher. When the MCIT is higher, the ATC is IC 055. Finally subtract the credits: prior year's excess, quarterly payments, 2307s, and others (Items 44 to 54)."],
    ["3. Rates, deadline and penalties", "Under the CREATE law the domestic corporation rate is 25%, or 20% for a corporation with net taxable income of ₱5 million or less and total assets (excluding land) of ₱100 million or less. The rate is a box the taxpayer fills in; the lab's cases tell the student which one applies (verify against the Code; see the rules file). The annual return is due on or before the 15th day of the 4th month after the close of the taxable year: April 15 for a calendar-year corporation. A late return carries surcharge, interest and compromise (25% and 12% in general; 10% and 6% for micro and small taxpayers; verify)."],
  ],
  worked: { intro: "Mabini Foods Corp.: gross income ₱4,000,000, itemized deductions ₱3,000,000, 25% rate, credits ₱150,000.", steps: ["Net taxable income = ₱1,000,000; normal tax 25% = ₱250,000.", "MCIT 2% × ₱4,000,000 = ₱80,000. Tax due = ₱250,000 (higher).", "Net tax payable = ₱250,000 − ₱150,000 = ₱100,000."], title: "Form 1702-RT", table: { "33": "4,000,000", "37": "3,000,000", "39": "1,000,000", "41": "250,000", "42": "80,000", "43": "250,000", "55": "150,000", "56": "100,000" } },
  legal: ["NIRC Sec. 27(A) and (E) as amended by RA 11534 (CREATE); Sec. 34 (deductions and OSD); Sec. 52 (return and payment); BIR Form 1702-RT January 2018 (ENCS).", "NIRC Secs. 248-249 and RA 11976 (EOPT) for penalties."],
  guide: [
    ["1 to 5", "1", "Calendar or fiscal, year ended (MM/YYYY), amended, short period, ATC.", "Your books.", "ATC IC 010 when the MCIT applies."],
    ["6 to 12", "6", "TIN, RDO, registered name and address, ZIP, date of incorporation, contact number, email.", "Certificate of Registration.", "Using the trade name."],
    ["13", "13", "Itemized deductions or OSD.", "Your election.", "OSD plus actual expenses."],
    ["27 to 33", "27A", "Sales, returns, cost, other income; computed net sales, gross income and Item 33.", "Books.", "Final-taxed income in Item 32."],
    ["Sch. I", "k1A", "Ordinary deductions by type (17 lines); the total is computed.", "Ledger.", "Non-deductible items."],
    ["34 to 39", "34A", "Computed ordinary deductions; special deductions and NOLCO (typed); total or OSD; net taxable income.", "Computed.", "Both itemized and OSD."],
    ["40 and 41", "40", "Tax rate box, then the computed normal tax.", "Eligibility for 20%.", "Using 20% above ₱5M net taxable income."],
    ["42 and 43", "42A", "Computed MCIT (2%) and the higher tax.", "Computed.", "Ignoring the MCIT."],
    ["44 to 56", "44A", "Credits by type; total and net payable are computed.", "Quarterly returns, 2307s.", "Quarterly payments in Item 44."],
    ["14 to 21", "14A", "Computed totals; compromise typed; surcharge and interest from the filing date.", "Filing date.", "Penalty on the tax due instead of the payable."],
    ["22 and OV", "22", "Number of attachments; for an overpayment, one box.", "Your choice.", "Two boxes."],
  ],
  checklist: ["Get the audited FS and tax reconciliation.", "Check the registration (ATC, RDO).", "Gather quarterly returns and 2307s.", "Check eligibility for the 20% rate.", "Know the due date: 15th day of the 4th month."],
  pitfalls: ["Forgetting the MCIT.", "Wrong ATC when MCIT is the tax.", "25% when 20% applies, or the reverse.", "Counting final-taxed income.", "Itemized and OSD together."],
  amended: "Tick Yes in Item 3 and enter the tax paid in the original return in Item 51.",
  noPayment: "If credits cover the tax the net payable is zero or an overpayment; one irrevocable choice (refund, TCC, carry-over) is required.",
  quiz: [
    ["The MCIT is computed as:", ["1% of net taxable income", "2% of gross income (Item 33)", "2% of sales", "25% of net income"], 1, "The form prints 'MCIT Due (2% of Item 33)'."],
    ["Normal tax ₱40,000, MCIT ₱100,000. Tax due?", ["₱40,000", "₱100,000", "₱140,000", "₱60,000"], 1, "The higher of the two."],
    ["A calendar-year 2025 corporation files 1702-RT by:", ["March 15, 2026", "April 15, 2026", "May 15, 2026", "June 30, 2026"], 1, "The 15th day of the 4th month after year-end."],
    ["OSD for a corporation is:", ["40% of gross income", "40% of sales", "10% of gross income", "60% of gross income"], 0, "40% of gross income (Item 33)."],
    ["Which ATC when the MCIT is the tax due?", ["IC 010", "IC 055", "IC 021", "II012"], 1, "IC 055 Minimum Corporate Income Tax."],
  ],
});
