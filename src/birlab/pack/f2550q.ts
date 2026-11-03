// BIR Form 2550Q, April 2024 (ENCS): Quarterly Value-Added Tax Return.
// Item numbers follow docs/bir-forms/2550Q-Apr-2024.pdf and its Guidelines (VAT 12%; filed and paid within 25 days after the quarter). Simplified: Part V schedules
// (capital goods amortization, input tax on exempt sales, creditable VAT withheld, advance payments) are typed as totals in Part II / Part IV.
import { RULES } from "../rules/2026";
import { roundToPeso, type Classification } from "../engine/tax";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { addDays, caseOf, lessonOf, quarterEnd } from "./kit";

const vat = (cents: number) => roundToPeso(Math.round(cents * RULES.vat.rate));
const KLASS: Record<string, Classification> = { micro: "micro", small: "small", medium: "medium", large: "large" };
const dueOf = (v: Values) => { const end = quarterEnd(v["2"], Number(v["3"])); return end ? addDays(end, RULES.vat.dueDays) : ""; };

export const DEF = makeForm({
  id: "2550Q", number: "2550Q", title: "Quarterly Value-Added Tax Return", subtitle: "Output tax, input tax and the net VAT payable for the quarter",
  version: "April 2024 (ENCS)", versionNote: "Official PDF: 2550Q April 2024 ENCS and its Guidelines (12%; within 25 days after the close of the quarter; 25%/10% surcharge and the EOPT interest and compromise).",
  yearId: "2", spouse: () => true, colLabels: ["A) Sales / Purchases", "B) Output / Input Tax"],
  identity: [
    fields(f("1", "1", "For the", "radio", { span: 4, options: opts(["calendar", "Calendar"], ["fiscal", "Fiscal"]), required: true }), f("2", "2", "Year Ended (MM/YYYY)", "monthyear", { span: 3, required: true }), f("3", "3", "Quarter", "radio", { span: 3, options: opts(["1", "1st"], ["2", "2nd"], ["3", "3rd"], ["4", "4th"]), required: true })),
    fields(f("4", "4", "Return Period (MM/DD/YYYY to MM/DD/YYYY)", "text", { span: 6 }), yes("5", "5", "Amended Return?", 3), yes("6", "6", "Short Period Return?", 3)),
    fields(f("7", "7", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("8", "8", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("9", "9", "Taxpayer's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("10", "10", "Registered Address", "text", { span: 9, required: true }), f("10A", "10A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("11", "11", "Contact Number", "phone", { span: 5 }), f("12", "12", "Email Address", "email", { span: 7 })),
    radio("13", "13", "Taxpayer Classification", opts(["micro", "Micro"], ["small", "Small"], ["medium", "Medium"], ["large", "Large"])),
    fields(yes("14", "14", "Are you availing of tax relief under Special Law or International Tax Treaty?", 6)),
    fields(f("OV", "Excess", "If excess credits, choose how to use them", "radio", { span: 12, options: opts(["carry", "Carry over to the next quarter"], ["refund", "Apply for refund/TCC"]) })),
  ],
  required: ["1", "2", "3", "5", "6", "7", "8", "9", "10", "10A", "13", "14"].map((id) => ({ id, message: `Item ${id} is required.` })),
  formats: { tin: ["7"], rdo: ["8"], zip: ["10A"], email: ["12"] },
  sections: [
    { id: "p2", title: "Part II – Total Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", cols: ["A"], lines: [
      { id: "15", item: "15", label: "Net VAT Payable/(Excess Input Tax) (From Part IV, Item 61)", f: (c) => c.at("61", "B"), bold: true, key: true },
      { id: "16", item: "16", label: "Creditable VAT Withheld (From Part V - Schedule 3, Column D)" },
      { id: "17", item: "17", label: "Advance VAT Payments (From Part V - Schedule 4)" },
      { id: "18", item: "18", label: "VAT paid in return previously filed, if this is an amended return" },
      { id: "19", item: "19", label: "Other Credits/Payment (specify)", specify: true },
      { id: "20", item: "20", label: "Total Tax Credits/Payment (Sum of Items 16 to 19)", f: (c) => c.n("16") + c.n("17") + c.n("18") + c.n("19") },
      { id: "21", item: "21", label: "Tax Still Payable/(Excess Credits) (Item 15 Less Item 20)", f: (c) => c.n("15") - c.n("20"), bold: true, key: true },
      { heading: "Add: Penalties" },
      { id: "22", item: "22", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "23", item: "23", label: "Interest", f: () => 0, indent: 1 },
      { id: "24", item: "24", label: "Compromise", indent: 1 },
      { id: "25", item: "25", label: "Total Penalties (Sum of Items 22 to 24)", f: () => 0 },
      { id: "26", item: "26", label: "TOTAL AMOUNT PAYABLE/(Excess Credits) (Sum of Items 21 and 25)", f: () => 0, bold: true, key: true },
    ] },
    { id: "p4", title: "Part IV – Details of VAT Computation", lines: [
      { id: "31", item: "31", label: "VATable Sales (A) and Output Tax (B, 12%)", f: (c) => vat(c.at("31", "A")), computedCols: ["B"], key: true },
      { id: "32", item: "32", label: "Zero-Rated Sales", cols: ["A"] },
      { id: "33", item: "33", label: "Exempt Sales", cols: ["A"] },
      { id: "34", item: "34", label: "Total Sales (A) & Output Tax Due (B)", f: (c) => (c.col === "A" ? c.n("31") + c.n("32") + c.n("33") : c.n("31")), bold: true, key: true },
      { id: "35", item: "35", label: "Less: Output VAT on Uncollected Receivables", cols: ["B"] },
      { id: "36", item: "36", label: "Add: Output VAT on Recovered Uncollected Receivables Previously Deducted", cols: ["B"] },
      { id: "37", item: "37", label: "Total Adjusted Output Tax Due (Item 34B Less Item 35B Add Item 36B)", f: (c) => c.n("34") - c.n("35") + c.n("36"), cols: ["B"], bold: true, key: true },
      { id: "38", item: "38", label: "Input Tax Carried Over from Previous Quarter", cols: ["B"] },
      { id: "39", item: "39", label: "Input Tax Deferred on Capital Goods Exceeding P1 Million from Previous Quarter", cols: ["B"] },
      { id: "40", item: "40", label: "Transitional Input Tax", cols: ["B"] },
      { id: "41", item: "41", label: "Presumptive Input Tax", cols: ["B"] },
      { id: "42", item: "42", label: "Others (Specify)", cols: ["B"], specify: true },
      { id: "43", item: "43", label: "Total (Sum of Items 38B to 42B)", f: (c) => c.n("38") + c.n("39") + c.n("40") + c.n("41") + c.n("42"), cols: ["B"] },
      { id: "44", item: "44", label: "Domestic Purchases (A) and Input Tax (B, 12%)", f: (c) => vat(c.at("44", "A")), computedCols: ["B"] },
      { id: "45", item: "45", label: "Services Rendered by Non-Residents (A) and Input Tax (B, 12%)", f: (c) => vat(c.at("45", "A")), computedCols: ["B"] },
      { id: "46", item: "46", label: "Importations (A) and Input Tax (B, 12%)", f: (c) => vat(c.at("46", "A")), computedCols: ["B"] },
      { id: "47", item: "47", label: "Others (Specify)", specify: true },
      { id: "48", item: "48", label: "Domestic Purchases with No Input Tax", cols: ["A"] },
      { id: "49", item: "49", label: "VAT-Exempt Importations", cols: ["A"] },
      { id: "50", item: "50", label: "Total Current Purchases (A) / Input Tax (B)", f: (c) => (c.col === "A" ? c.n("44") + c.n("45") + c.n("46") + c.n("47") + c.n("48") + c.n("49") : c.n("44") + c.n("45") + c.n("46") + c.n("47")), bold: true },
      { id: "51", item: "51", label: "Total Available Input Tax (Sum of Items 43B and 50B)", f: (c) => c.n("43") + c.n("50"), cols: ["B"], bold: true, key: true },
      { id: "52", item: "52", label: "Input Tax on Purchases/Importation of Capital Goods exceeding P1 Million deferred for the succeeding period", cols: ["B"] },
      { id: "53", item: "53", label: "Input Tax Attributable to VAT Exempt Sales (From Part V - Schedule 2)", cols: ["B"] },
      { id: "54", item: "54", label: "VAT Refund/TCC Claimed", cols: ["B"] },
      { id: "55", item: "55", label: "Input VAT on Unpaid Payables", cols: ["B"] },
      { id: "56", item: "56", label: "Others (Specify)", cols: ["B"] },
      { id: "57", item: "57", label: "Total Deductions from Input Tax (Sum of Items 52B to 56B)", f: (c) => c.n("52") + c.n("53") + c.n("54") + c.n("55") + c.n("56"), cols: ["B"] },
      { id: "58", item: "58", label: "Add: Input VAT on Settled Unpaid Payables Previously Deducted", cols: ["B"] },
      { id: "59", item: "59", label: "Adjusted Deductions from Input Tax (Sum of Items 57B and 58B)", f: (c) => c.n("57") + c.n("58"), cols: ["B"] },
      { id: "60", item: "60", label: "Total Allowable Input Tax (Item 51B Less Item 59B)", f: (c) => c.n("51") - c.n("59"), cols: ["B"], bold: true, key: true },
      { id: "61", item: "61", label: "Net VAT Payable/(Excess Input Tax) (Item 37B Less Item 60B) (To Part II, Item 15)", f: (c) => c.n("37") - c.n("60"), cols: ["B"], bold: true, key: true },
    ] },
  ],
  split: 1,
  penalty: { base: "21", surcharge: "22", interest: "23", compromise: "24", total: "25", grand: "26", cols: ["A"], klass: (v) => KLASS[v["13"]], gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v, _ctx, computed): Issue[] => {
    const out: Issue[] = [];
    if (v["5"] === "yes" && !(Number(v["18A"]) > 0)) out.push({ id: "18A", item: "18", message: "This is an amended return: enter the VAT paid in the return previously filed (Item 18)." });
    if (Number(computed["21A"] ?? 0) < 0 && !v["OV"]) out.push({ id: "OV", item: "Excess", message: "There are excess credits: choose carry over or refund/TCC." });
    return out;
  },
  scoreExtra: [{ id: "13", weight: 1 }],
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string): Values => ({ "7": `000-${n}-333-00000`, "8": rdo, "9": name, "10": addr, "10A": zip, "11": `0917000${n}`, "12": `vat${n}@example.com` });
const common = { "1": "calendar", "2": "12/2025", "5": "no", "6": "no", "14": "no" } as const;

export const CASES = [
  caseOf({
    form: "2550Q", level: "easy", year: 2025, title: "A hardware store's first quarter",
    story: ["Aguinaldo Hardware & Supply (San Jose City, Nueva Ecija 3121) is a VAT-registered small taxpayer. January to March 2025: VATable sales ₱1,000,000 (net of VAT); domestic purchases ₱600,000 (net of VAT) with proper invoices; creditable VAT withheld by customers ₱2,000. No other transactions and nothing carried over.", "The return is due 25 days after March 31, and is filed on April 24, 2025. Fill in BIR Form 2550Q for the first quarter of 2025 (the year ended 12/2025)."],
    profile: P(161, "026", "AGUINALDO HARDWARE & SUPPLY", "BRGY. CRUZ NA LIGAS, SAN JOSE CITY, NUEVA ECIJA", "3121"),
    facts: { ...common, "3": "1", "13": "small", "31A": "1000000", "44A": "600000", "16A": "2000" },
    filing: "2025-04-24",
    why: "A VAT-registered taxpayer files the quarterly VAT return, Form 2550Q.",
    hints: ["Output tax is 12% of VATable sales.", "Input tax is 12% of domestic purchases with VAT invoices.", "Net VAT payable = adjusted output tax − allowable input tax; creditable VAT withheld reduces what is still payable."],
    solution: ["Output tax (Item 31B) = 12% × ₱1,000,000 = ₱120,000 = Item 34B = Item 37B.", "Input tax (Item 44B) = 12% × ₱600,000 = ₱72,000 = Items 50B, 51B, 60B.", "Net VAT payable (Item 61 = Item 15) = ₱120,000 − ₱72,000 = ₱48,000. Less creditable VAT withheld ₱2,000: Item 21 = ₱46,000. Filed on time (due April 25): Item 26 = ₱46,000."],
  }),
  caseOf({
    form: "2550Q", level: "average", year: 2025, title: "Zero-rated, exempt, imports and a carried-over input",
    story: ["Nueva Ecija Rice Exporters, Inc. (Cabanatuan City 3100), a small VAT-registered taxpayer, reports for April to June 2025: VATable sales ₱2,500,000, zero-rated export sales ₱500,000, exempt sales ₱100,000. Input tax carried over from the first quarter ₱15,000. Purchases: domestic ₱1,500,000, importations ₱200,000, services rendered by non-residents ₱50,000 (all VATable at 12%). Input tax attributable to the VAT-exempt sales ₱8,000. Creditable VAT withheld ₱5,000.", "It files on July 22, 2025. Fill in BIR Form 2550Q for the second quarter of 2025."],
    profile: P(162, "025", "NUEVA ECIJA RICE EXPORTERS, INC.", "BRGY. SANGITAN, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "3": "2", "13": "small", "31A": "2500000", "32A": "500000", "33A": "100000", "38B": "15000", "44A": "1500000", "45A": "50000", "46A": "200000", "53B": "8000", "16A": "5000" },
    filing: "2025-07-22",
    why: "A VAT-registered taxpayer files the quarterly VAT return, Form 2550Q, including zero-rated and exempt sales.",
    hints: ["Only VATable sales carry output tax; zero-rated and exempt sales appear in the sales column only.", "Total available input tax includes the input carried over (Item 38).", "Input tax on exempt sales is a deduction (Item 53)."],
    solution: ["Total sales (Item 34A) = ₱2,500,000 + ₱500,000 + ₱100,000 = ₱3,100,000; output tax (Item 34B = 37B) = 12% × ₱2,500,000 = ₱300,000.", "Current input tax (Item 50B) = 12% × (₱1,500,000 + ₱50,000 + ₱200,000) = 12% × ₱1,750,000 = ₱210,000. Available input tax (Item 51B) = ₱15,000 + ₱210,000 = ₱225,000. Deductions (Items 57B, 59B) = ₱8,000. Allowable input tax (Item 60B) = ₱217,000.", "Net VAT payable (Item 61) = ₱300,000 − ₱217,000 = ₱83,000. Less creditable VAT withheld ₱5,000: Item 21 = ₱78,000; Item 26 = ₱78,000 (on time)."],
  }),
  caseOf({
    form: "2550Q", level: "difficult", year: 2025, title: "Adjustments in output and input, filed late",
    story: ["Santos Trading Corp. (Gapan City 3105), a medium taxpayer, reports for July to September 2025: VATable sales ₱4,000,000, zero-rated ₱1,000,000, exempt ₱250,000. Output VAT on uncollected receivables to deduct ₱12,000; output VAT on recovered receivables previously deducted ₱3,000. Input tax carried over ₱20,000; presumptive input tax ₱5,000. Domestic purchases ₱3,000,000. Input tax attributable to exempt sales ₱14,000; input VAT on unpaid payables ₱18,000; input VAT on settled unpaid payables previously deducted ₱6,000. Creditable VAT withheld ₱10,000.",
      "The return was due October 25, 2025. It is filed and paid on November 14, 2025, 20 days late. As a medium taxpayer, the general penalty rates apply (25% surcharge, 12% interest by the day over 365); the compromise assessed is ₱2,000. Fill in BIR Form 2550Q for the third quarter of 2025."],
    profile: P(163, "027", "SANTOS TRADING CORP.", "BRGY. MAPALAD, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "3": "3", "13": "medium", "31A": "4000000", "32A": "1000000", "33A": "250000", "35B": "12000", "36B": "3000", "38B": "20000", "41B": "5000", "44A": "3000000", "53B": "14000", "55B": "18000", "58B": "6000", "16A": "10000", "24A": "2000" },
    filing: "2025-11-14",
    why: "A VAT-registered taxpayer files the quarterly VAT return, Form 2550Q, even when late and with adjustments.",
    hints: ["Adjusted output = output − uncollected receivables + recovered receivables.", "Adjusted deductions from input tax = Item 57B + Item 58B.", "September 30 plus 25 days is October 25. Count the days to November 14."],
    solution: ["Output tax (Item 34B) = 12% × ₱4,000,000 = ₱480,000. Adjusted output (Item 37B) = ₱480,000 − ₱12,000 + ₱3,000 = ₱471,000.", "Input: carried over + presumptive (Item 43B) = ₱25,000; current (Item 50B) = 12% × ₱3,000,000 = ₱360,000; available (Item 51B) = ₱385,000. Deductions (Item 57B) = ₱14,000 + ₱18,000 = ₱32,000; adjusted (Item 59B) = ₱32,000 + ₱6,000 = ₱38,000; allowable (Item 60B) = ₱347,000.", "Net VAT payable (Item 61) = ₱471,000 − ₱347,000 = ₱124,000. Less creditable VAT withheld ₱10,000: Item 21 = ₱114,000.", "20 days late: surcharge (Item 22) = 25% × ₱114,000 = ₱28,500; interest (Item 23) = ₱114,000 × 12% × 20 ÷ 365 = ₱749.59 → ₱750; compromise ₱2,000; total penalties ₱31,250. Item 26 = ₱145,250."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 2550Q: Quarterly Value-Added Tax Return", minutes: "About 9 minutes",
  sections: [
    ["1. Who files and when", "A VAT-registered person files Form 2550Q for each calendar or fiscal quarter, including the fourth quarter. The return is filed and the tax paid within twenty-five (25) days following the close of the quarter (per the form's Guidelines and Instructions), so January to March is due April 25. The monthly VAT declaration 2550M was dropped from 2023; the quarterly return is now the only VAT return. The form has a taxpayer classification box (micro, small, medium, large) that decides the penalty rates if the return is late."],
    ["2. Output tax, input tax, net VAT", "VAT is 12% (Guidelines). On the sales side, VATable sales (Item 31) carry output tax of 12%; zero-rated sales (Item 32, for example exports) and exempt sales (Item 33) are reported but carry no output tax. Output tax is adjusted for uncollected receivables and recovered receivables (Items 35 and 36) to get the adjusted output tax (Item 37).", "On the purchases side, input tax is the VAT on domestic purchases, services rendered by non-residents and importations (Items 44 to 47), plus input tax carried over from the previous quarter (Item 38) and transitional or presumptive input tax (Items 40 and 41). Total available input tax (Item 51) is reduced by deductions: input tax on capital goods deferred, input tax attributable to VAT-exempt sales, input VAT on unpaid payables, and others (Items 52 to 56); settled unpaid payables previously deducted are added back (Item 58). The net VAT payable (Item 61) is the adjusted output tax less the allowable input tax; a negative result is excess input tax."],
    ["3. Credits and penalties", "Part II credits the net VAT payable with creditable VAT withheld by government and other withholding agents, advance VAT payments (for example from sales of services to government), VAT paid in an earlier return if amended, and other credits. A late return has a surcharge and interest on the tax still payable (Item 21): in general 25% and 12% a year; micro and small taxpayers 10% and 6%, with a 50% reduced compromise (all from the Guidelines)."],
  ],
  worked: { intro: "A store: VATable sales ₱500,000, domestic purchases ₱300,000.", steps: ["Output tax 12% × ₱500,000 = ₱60,000; input tax 12% × ₱300,000 = ₱36,000.", "Net VAT payable = ₱24,000."], title: "Form 2550Q", table: { "31A": "500,000", "31B": "60,000", "37B": "60,000", "44A": "300,000", "44B": "36,000", "60B": "36,000", "61B": "24,000" } },
  legal: ["NIRC Secs. 105 to 115 (VAT) and Sec. 114 (return and payment); RR 16-2005 as amended; BIR Form 2550Q (April 2024) and its Guidelines and Instructions.", "RA 11976 (EOPT) for the penalties of micro and small taxpayers."],
  guide: [
    ["1 to 6", "1", "Calendar or fiscal, year ended, quarter, return period, amended, short period.", "Your records.", "Wrong quarter."],
    ["7 to 14", "7", "TIN, RDO, name, address, contact, email, taxpayer classification, tax relief.", "COR.", "Wrong classification."],
    ["31 to 34", "31A", "VATable (output tax computed), zero-rated and exempt sales; totals are computed.", "Sales invoices.", "Output tax on zero-rated sales."],
    ["35 to 37", "35B", "Output VAT on uncollected receivables (deduct) and recovered (add); adjusted output tax.", "Receivable ledger.", "Using the sales instead of the VAT."],
    ["38 to 43", "38B", "Input tax carried over, deferred capital goods, transitional, presumptive, others; total.", "Last quarter's return.", "Forgetting the carry-over."],
    ["44 to 50", "44A", "Purchases per type (input tax computed at 12%), others, and purchases with no input tax.", "Purchase invoices.", "Input tax on exempt purchases."],
    ["51 to 61", "53B", "Available input tax; deductions; allowable input; net VAT payable.", "Schedules.", "Skipping the exempt-sales deduction."],
    ["15 to 26", "16A", "Computed net VAT; credits; tax still payable; penalties from the filing date.", "Withholding certificates, filing date.", "Penalty on Item 15 instead of Item 21."],
  ],
  checklist: ["List all sales by type (VATable, zero-rated, exempt).", "Collect purchase invoices with VAT.", "Bring the carried-over input from the last quarter.", "Compute by the 25th day after quarter-end."],
  pitfalls: ["Output tax on zero-rated sales.", "Input tax without a VAT invoice.", "Forgetting the carry-over.", "Mixing up Item 15 and Item 21.", "Wrong taxpayer classification (penalty rates)."],
  amended: "Tick Yes in Item 5 and enter the VAT paid in the original return in Item 18.",
  noPayment: "If input tax exceeds output tax there is no payment; choose to carry over the excess or apply for refund/TCC.",
  quiz: [
    ["The VAT rate is:", ["3%", "10%", "12%", "15%"], 2, "12% of gross sales (Guidelines)."],
    ["A 2550Q for January to March is due:", ["April 15", "April 25", "May 15", "June 30"], 1, "Within twenty-five days after the close of the quarter."],
    ["Zero-rated sales carry output tax of:", ["12%", "6%", "0%", "3%"], 2, "Zero-rated: 0%."],
    ["Output ₱120,000, allowable input ₱72,000. Net VAT payable?", ["₱48,000", "₱192,000", "₱72,000", "₱120,000"], 0, "₱120,000 − ₱72,000."],
    ["A small taxpayer late surcharge is:", ["25%", "10%", "50%", "5%"], 1, "10% per the Guidelines (EOPT)."],
  ],
});
