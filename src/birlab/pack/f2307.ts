// BIR Form 2307, January 2018 (ENCS): Certificate of Creditable Tax Withheld at Source.
// Item numbers follow docs/bir-forms/2307-Jan-2018.pdf. Simplified to one ATC line (Part III) with three monthly income payments. The ATC rates come from rules/2026.ts (ewt), which flags that
// they were not machine-checked against the PDF's rate table (it did not extract cleanly).
import { RULES } from "../rules/2026";
import { isIso, roundToPeso } from "../engine/tax";
import { f, fields, makeForm, opts, radio } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { addDays, caseOf, lessonOf } from "./kit";

const ATC = opts(...Object.entries(RULES.ewt.labels).map(([code, label]) => [code, label] as [string, string]));

/** The certificate is given to the payee within 20 days after the close of the quarter (the period's To date plus 20 days). */
const dueOf = (v: Values) => { const to = (v["1B"] ?? "").replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$1-$2"); return isIso(to) ? addDays(to, RULES.certificateDue.form2307Days) : ""; };

export const DEF = makeForm({
  id: "2307", number: "2307", title: "Certificate of Creditable Tax Withheld at Source", subtitle: "Payor-issued certificate of creditable tax withheld",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 2307 Jan 2018 ENCS v3. The payor gives it to the payee within 20 days after the quarter (RR 11-2018).",
  identity: [
    fields(f("1", "1", "For the Period From (MM/DD/YYYY)", "date", { span: 6, required: true }), f("1B", "1", "To (MM/DD/YYYY)", "date", { span: 6, required: true })),
    fields(f("2", "2", "Payee's Taxpayer Identification Number (TIN)", "tin", { span: 12, required: true })),
    fields(f("3", "3", "Payee's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("4", "4", "Payee's Registered Address", "text", { span: 9, required: true }), f("4A", "4A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("6", "6", "Payor's Taxpayer Identification Number (TIN)", "tin", { span: 12, required: true })),
    fields(f("7", "7", "Payor's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("8", "8", "Payor's Registered Address", "text", { span: 9, required: true }), f("8A", "8A", "ZIP Code", "zip", { span: 3, required: true })),
    radio("atc", "III-ATC", "Part III: ATC of the income payments subject to expanded withholding tax", ATC),
  ],
  required: [{ id: "1" }, { id: "1B" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "4A" }, { id: "6" }, { id: "7" }, { id: "8" }, { id: "8A" }, { id: "atc", message: "Choose the ATC of the income payment." }].map((r) => ({ ...r, message: r.message ?? `Item ${r.id} is required.` })),
  formats: { tin: ["2", "6"], zip: ["4A", "8A"] },
  sections: [
    { id: "p3", title: "Part III – Details of Monthly Income Payments and Taxes Withheld", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "i1", item: "III-m1", label: "Amount of income payments: 1st month of the quarter" },
      { id: "i2", item: "III-m2", label: "Amount of income payments: 2nd month of the quarter" },
      { id: "i3", item: "III-m3", label: "Amount of income payments: 3rd month of the quarter" },
      { id: "it", item: "III-total", label: "Total income payments for the quarter", f: (c) => c.n("i1") + c.n("i2") + c.n("i3"), bold: true, key: true },
      { id: "tw", item: "III-tax", label: "Tax withheld for the quarter (total income payments x the ATC's rate)", f: (c) => roundToPeso(Math.round(c.n("it") * (RULES.ewt.rates[c.text("atc")] ?? 0))), bold: true, key: true },
    ] },
  ],
  due: dueOf,
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    const name = v["3"] ?? "";
    const corp = /\b(INC|CORP|CORPORATION|CO\.|LTD)\b/i.test(name);
    if (v["atc"]?.startsWith("WI") && corp) out.push({ id: "atc", item: "III-ATC", message: "WI codes are for individual payees; this payee is a registered company (use a WC code)." });
    if (v["atc"]?.startsWith("WC") && name && !corp) out.push({ id: "atc", item: "III-ATC", message: "WC codes are for non-individual payees; this payee is an individual (use a WI code)." });
    return out;
  },
  scoreExtra: [{ id: "atc", weight: 3 }],
});

const P = (n: number, name: string, addr: string, zip: string): Values => ({ "2": `000-000-${n}-00000`, "3": name, "4": addr, "4A": zip, "6": "000-555-666-00000", "7": "GAPAN GRAINS & FEEDS, INC.", "8": "NATIONAL HIGHWAY, GAPAN CITY, NUEVA ECIJA", "8A": "3105" });
const common = { "1": "01/01/2025", "1B": "03/31/2025" } as const;

export const CASES = [
  caseOf({
    form: "2307", level: "easy", year: 2025, title: "An accountant's fees (5%)",
    story: ["You are the accountant of Gapan Grains & Feeds, Inc., the payor. For the first quarter of 2025 (January 1 to March 31) it paid professional fees to Atty. Dennis P. Flores, an individual lawyer in Cabanatuan City whose gross income for the year is expected not to exceed ₱3,000,000: ₱40,000 in January, ₱40,000 in February and ₱40,000 in March.", "Choose the correct ATC and rate, and compute the tax withheld. Issue the Form 2307 (due 20 days after March 31)."],
    profile: P(951, "FLORES, DENNIS, PADILLA", "BRGY. SANGITAN, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, atc: "WI010", i1A: "40000", i2A: "40000", i3A: "40000" },
    filing: "2025-04-18",
    why: "The payor certifies creditable tax withheld from the payee with Form 2307.",
    hints: ["Individual professional, gross income not above ₱3M: WI010.", "The tax withheld is the total of the quarter times the rate.", "The rate for WI010 is 5%."],
    solution: ["Total income payments = ₱40,000 × 3 = ₱120,000.", "ATC WI010 (professional individual, gross income ≤ ₱3M): 5%. Tax withheld = 5% × ₱120,000 = ₱6,000."],
  }),
  caseOf({
    form: "2307", level: "average", year: 2025, title: "Rent paid to a corporation (5%)",
    story: ["The same payor leases a warehouse from Mabini Realty Corp. in Cabanatuan City (a non-individual lessor). For the second quarter of 2025 (April 1 to June 30) the monthly rent was ₱60,000, ₱60,000 and ₱65,000 (a rent adjustment in June).", "Choose the ATC for rental of real property by a non-individual payee, and compute the tax withheld."],
    profile: P(952, "MABINI REALTY CORP.", "BRGY. MABINI, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { "1": "04/01/2025", "1B": "06/30/2025", atc: "WC100", i1A: "60000", i2A: "60000", i3A: "65000" },
    filing: "2025-07-18",
    why: "The payor certifies creditable tax withheld with Form 2307.",
    hints: ["A corporation is a non-individual: WC codes.", "Rental of real property is 5% (WC100).", "Add the three months first."],
    solution: ["Total payments = ₱60,000 + ₱60,000 + ₱65,000 = ₱185,000.", "ATC WC100 (rental of real property, non-individual payee): 5%. Tax withheld = 5% × ₱185,000 = ₱9,250."],
  }),
  caseOf({
    form: "2307", level: "difficult", year: 2025, title: "A top withholding agent buys services",
    story: ["Gapan Grains & Feeds, Inc. is a top withholding agent. For the third quarter of 2025 (July 1 to September 30) it paid San Jose Security & Janitorial Services Corp. (a non-individual supplier of services) ₱180,000 in July, ₱175,500 in August and ₱190,500 in September for security services.", "Choose the ATC for payments by top withholding agents to a local supplier of services, and compute the tax withheld."],
    profile: P(953, "SAN JOSE SECURITY & JANITORIAL SERVICES CORP.", "BRGY. ABAR 1ST, SAN JOSE CITY, NUEVA ECIJA", "3121"),
    facts: { "1": "07/01/2025", "1B": "09/30/2025", atc: "WC160", i1A: "180000", i2A: "175500", i3A: "190500" },
    filing: "2025-10-20",
    why: "The payor certifies creditable tax withheld with Form 2307.",
    hints: ["Top withholding agent, supplier of services: WC160.", "The rate for services is 2%; for goods, 1%.", "Total first, then multiply by the rate."],
    solution: ["Total payments = ₱180,000 + ₱175,500 + ₱190,500 = ₱546,000.", "ATC WC160 (top withholding agent, services): 2%. Tax withheld = 2% × ₱546,000 = ₱10,920."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 2307: Certificate of Creditable Tax Withheld at Source", minutes: "About 6 minutes",
  sections: [
    ["1. What the certificate is", "When certain payors (withholding agents) pay income such as professional fees, rent or supplier payments, they withhold a small percentage as an advance on the payee's income tax and remit it to the BIR. The Form 2307 is the payor's certificate that tax was withheld. The payee attaches it to the quarterly and annual income tax returns as a tax credit (1701Q Item 58, 1701 Part VII, 1702 forms). The payor gives the certificate to the payee within 20 days after the close of the quarter (RR 11-2018)."],
    ["2. Filling it", "Parts I and II identify the payee and the payor. Part III lists, for each ATC, the income payments in each month of the quarter, the total, and the tax withheld. The ATC decides the rate: for example WI010/WI011 for professional fees paid to individuals (5% if the payee's gross income for the year does not exceed ₱3 million, 10% if more or if VAT-registered), WC010/WC011 for non-individual professionals (thresholds of ₱720,000), WC100 (5%) for rentals, and WC158/WC160 for top withholding agents' purchases of goods (1%) and services (2%). WI codes are for individual payees, WC codes for non-individuals. Rates in this lab are flagged as not machine-checked against the PDF's rate table (see the rules file)."],
    ["3. Using the certificate", "A 2307 may not be used twice for the same income payment (RR 11-2018). The payee should check the ATC, the amounts and the withholding agent's TIN, and keep the original. Withholding agents report the remittances in 1601-EQ and the annual 1604-E."],
  ],
  worked: { intro: "A corporation pays an individual lawyer ₱30,000 a month for a quarter (gross income not above ₱3M).", steps: ["Total = ₱90,000. ATC WI010 at 5%: tax withheld = ₱4,500."], title: "Form 2307, Part III", table: { "Total": "90,000", "Tax withheld": "4,500" } },
  legal: ["NIRC Sec. 57 (withholding of tax at source), RR 2-98 as amended by RR 11-2018 (expanded withholding rates and 2307); BIR Form 2307 (January 2018 ENCS)."],
  guide: [
    ["1", "1", "The quarter: first and last day (MM/DD/YYYY).", "The payments records.", "A period that is not a quarter."],
    ["2 to 4", "2", "Payee's TIN, name, address, ZIP.", "The payee's COR.", "Using the trade name."],
    ["6 to 8", "6", "Payor's TIN, name, address, ZIP.", "The payor's COR.", "Payee and payor swapped."],
    ["III ATC", "atc", "The ATC that fits the payment and the payee.", "The ATC table on the form.", "WI code for a corporation."],
    ["III months", "i1A", "The income payments in each month of the quarter.", "Vouchers.", "Using the gross including VAT."],
    ["III total, tax", "it", "Computed: total and the tax withheld at the ATC's rate.", "Computed.", "Wrong rate."],
  ],
  checklist: ["Identify the payee's type (individual or non-individual).", "Check the payee's gross income and VAT status for professionals.", "Total each month's payments.", "Issue within 20 days of quarter-end."],
  pitfalls: ["Wrong WI/WC code.", "5% vs 10% for professionals.", "Using the wrong quarter.", "Withholding on the VAT amount."],
  amended: "Issue a corrected certificate and cancel the first; a 2307 may not be used twice.",
  noPayment: "The certificate is not a return; the tax is remitted by the payor in the 1601-EQ.",
  quiz: [
    ["Rent paid to a corporation is withheld at:", ["1%", "2%", "5%", "10%"], 2, "Rental of real property: 5% (WC100)."],
    ["Which code is for an individual professional with gross income ≤ ₱3M?", ["WC010", "WI010", "WI011", "WC160"], 1, "WI010 at 5%."],
    ["Total payments ₱200,000 at 2% gives:", ["₱2,000", "₱4,000", "₱10,000", "₱20,000"], 1, "2% × ₱200,000 = ₱4,000."],
    ["The payor gives the 2307 to the payee within:", ["5 days", "20 days after the quarter", "1 year", "10 days after payment"], 1, "Within 20 days after the close of the quarter."],
    ["The payee uses the 2307 as:", ["A tax return", "A tax credit", "A receipt", "An invoice"], 1, "A credit against income tax due."],
  ],
});
