// BIR Form 1800 (January 2018 ENCS): Donor's Tax Return.
// IMPORTANT: no official Form 1800 PDF could be downloaded from bir.gov.ph (the January 2018 version is only in the eBIRForms package), so this form was NOT built from the PDF.
// The computation follows the Code (Sec. 99 and 103 as amended by TRAIN: 6% of total net gifts in excess of P250,000 in a calendar year; return within 30 days after the gift) and the item labels
// are descriptive, not the printed item numbers. rules/2026.ts marks donorTax as unverified; verify the layout against the official form before using it in class.
import { RULES } from "../rules/2026";
import { isIso, roundToPeso, usToIso } from "../engine/tax";
import { f, fields, makeForm, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { addDays, caseOf, lessonOf } from "./kit";

const dueOf = (v: Values) => { const d = usToIso(v["1"]); return isIso(d) ? addDays(d, RULES.donorTax.dueDays) : ""; };

export const DEF = makeForm({
  id: "1800", number: "1800", title: "Donor's Tax Return", subtitle: "Tax on gifts: 6% of total net gifts above P250,000 in a calendar year",
  version: "January 2018 (ENCS), not built from the PDF", versionNote: "No official PDF was available: built from the Code (Sec. 99, 103). Item labels are descriptive. Return due within 30 days after the gift.",
  yearId: "1",
  identity: [
    fields(f("1", "Date", "Date of Donation (MM/DD/YYYY)", "date", { span: 4, required: true }), yes("2", "Amended", "Amended Return?", 3), f("3", "Sheets", "Number of Sheet/s Attached", "count", { span: 3, required: true })),
    fields(f("4", "TIN", "Donor's Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("5", "RDO", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("6", "Name", "Donor's Name (Last Name, First Name, Middle Name)", "text", { span: 12, required: true })),
    fields(f("7", "Address", "Donor's Registered Address", "text", { span: 9, required: true }), f("7A", "ZIP", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("8", "Donee", "Donee's Name", "text", { span: 8, required: true }), f("9", "Donee TIN", "Donee's TIN", "tin", { span: 4, required: true })),
    fields(f("10", "Relation", "Relationship of the donee to the donor", "text", { span: 6 }), yes("11", "NRA", "Is the donor a non-resident alien?", 6)),
  ],
  required: ["1", "2", "3", "4", "5", "6", "7", "7A", "8", "9", "11"].map((id) => ({ id, message: id === "3" ? "Enter the number of sheets attached (0 if none)." : "This item is required." })),
  formats: { tin: ["4", "9"], rdo: ["5"], zip: ["7A"] },
  sections: [
    { id: "gifts", title: "Computation of Donor's Tax", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "g1", item: "Gifts-1", label: "Gross gifts of this donation (fair market value of the property given)" },
      { id: "g2", item: "Gifts-2", label: "Less: Exempt gifts (for example gifts to the government or to accredited non-stock, non-profit organizations)" },
      { id: "g3", item: "Gifts-3", label: "Less: Allowable deductions (for example an encumbrance or mortgage assumed by the donee)" },
      { id: "g4", item: "Gifts-4", label: "Net gifts of this donation (Gifts-1 Less Gifts-2 and Gifts-3)", f: (c) => c.n("g1") - c.n("g2") - c.n("g3"), key: true },
      { id: "g5", item: "Gifts-5", label: "Add: Net gifts made earlier in the same calendar year" },
      { id: "g6", item: "Gifts-6", label: "Total net gifts for the calendar year (Gifts-4 plus Gifts-5)", f: (c) => c.n("g4") + c.n("g5"), key: true },
      { id: "g7", item: "Gifts-7", label: "Less: Annual exemption of P250,000", f: (c) => Math.min(Math.max(c.n("g6"), 0), RULES.donorTax.annualExemption * 100) },
      { id: "g8", item: "Gifts-8", label: "Taxable net gifts (Gifts-6 Less Gifts-7)", f: (c) => Math.max(c.n("g6") - c.n("g7"), 0), key: true },
      { id: "g9", item: "Gifts-9", label: "Donor's tax on the total taxable net gifts of the year (6.0%)", f: (c) => roundToPeso(Math.round(c.n("g8") * RULES.donorTax.rate)), bold: true, key: true },
      { id: "g10", item: "Gifts-10", label: "Less: Donor's tax paid on earlier gifts of the same calendar year" },
      { id: "g11", item: "Gifts-11", label: "Donor's tax due on this donation (Gifts-9 Less Gifts-10)", f: (c) => Math.max(c.n("g9") - c.n("g10"), 0) },
      { id: "g12", item: "Gifts-12", label: "Less: Tax paid in return previously filed, if this is an amended return" },
      { id: "g13", item: "Gifts-13", label: "Tax Payable (Gifts-11 Less Gifts-12)", f: (c) => c.n("g11") - c.n("g12"), bold: true, key: true },
      { heading: "Add: Penalties" },
      { id: "g14", item: "Pen-surcharge", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "g15", item: "Pen-interest", label: "Interest", f: () => 0, indent: 1 },
      { id: "g16", item: "Pen-compromise", label: "Compromise", indent: 1 },
      { id: "g17", item: "Pen-total", label: "Total Penalties", f: () => 0 },
      { id: "g18", item: "TOTAL", label: "TOTAL AMOUNT PAYABLE (Gifts-13 plus the total penalties)", f: () => 0, bold: true, key: true },
    ] },
  ],
  penalty: { base: "g13", surcharge: "g14", interest: "g15", compromise: "g16", total: "g17", grand: "g18", gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    if (v["2"] === "yes" && !(Number(v["g12A"]) > 0)) out.push({ id: "g12A", item: "Gifts-12", message: "This is an amended return: enter the tax paid in the return previously filed." });
    if (Number(v["g5A"]) > 0 && !(Number(v["g10A"]) >= 0)) out.push({ id: "g10A", item: "Gifts-10", message: "Enter the donor's tax already paid on the earlier gifts (0 if none)." });
    return out;
  },
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string, donee: string, rel: string): Values => ({ "4": `000-${n}-369-00000`, "5": rdo, "6": name, "7": addr, "7A": zip, "8": donee, "9": `000-${n}-482-00000`, "10": rel });
const common = { "2": "no", "3": "1", "11": "no" } as const;

export const CASES = [
  caseOf({
    form: "1800", level: "easy", year: 2025, title: "A cash gift to a daughter",
    story: ["Virgilio R. Hernandez (Barangay Zulueta, Cabanatuan City 3100), a citizen and resident, gave his daughter Maricel H. Santos ₱1,000,000 in cash on April 10, 2025. It is his only gift in 2025.", "He files and pays on May 5, 2025 (within 30 days). Fill in BIR Form 1800."],
    profile: P(251, "025", "HERNANDEZ, VIRGILIO, REYES", "BRGY. ZULUETA, CABANATUAN CITY, NUEVA ECIJA", "3100", "SANTOS, MARICEL, HERNANDEZ", "DAUGHTER"),
    facts: { ...common, "1": "04/10/2025", g1A: "1000000" },
    filing: "2025-05-05", klass: "large",
    why: "The tax on a donation is reported with Form 1800 (donor's tax return).",
    hints: ["Total net gifts of the year less ₱250,000 is the taxable base.", "The donor's tax is 6% of the taxable net gifts.", "No earlier gifts this year."],
    solution: ["Net gifts = ₱1,000,000. Less the annual exemption ₱250,000: taxable net gifts = ₱750,000.", "Donor's tax = 6% × ₱750,000 = ₱45,000. Filed on day 25: total payable ₱45,000."],
  }),
  caseOf({
    form: "1800", level: "average", year: 2025, title: "A second gift in the year, part of it exempt",
    story: ["Concepcion D. Mercado (Barangay Caalibangbangan, Cabanatuan City 3100) made a gift on June 2, 2025 to her son Rafael M. Mercado of property worth ₱1,500,000 and, in the same donation, ₱500,000 to an accredited non-stock, non-profit foundation (exempt). Earlier in 2025 (in February) she gave Rafael ₱300,000; the donor's tax on that gift was ₱3,000 (6% of ₱50,000, the part above ₱250,000), which she paid.",
      "She files on June 30, 2025. Fill in BIR Form 1800 for the June donation, using the cumulative computation for the calendar year."],
    profile: P(252, "025", "MERCADO, CONCEPCION, DIZON", "BRGY. CAALIBANGBANGAN, CABANATUAN CITY, NUEVA ECIJA", "3100", "MERCADO, RAFAEL, DIZON", "SON"),
    facts: { ...common, "1": "06/02/2025", g1A: "2000000", g2A: "500000", g5A: "300000", g10A: "3000" },
    filing: "2025-06-30", klass: "large",
    why: "The tax on a donation is reported with Form 1800; the annual exemption is applied once to the year's gifts.",
    hints: ["Exempt gifts to the foundation are subtracted.", "Add the net gifts earlier in the year before applying the ₱250,000 exemption.", "Subtract the donor's tax paid on the earlier gift."],
    solution: ["Net gifts this donation = ₱2,000,000 − ₱500,000 = ₱1,500,000. Add earlier net gifts ₱300,000: total net gifts for the year = ₱1,800,000.", "Taxable net gifts = ₱1,800,000 − ₱250,000 = ₱1,550,000; donor's tax on the year = 6% × ₱1,550,000 = ₱93,000.", "Less tax paid on the earlier gift ₱3,000: donor's tax due now = ₱90,000. On time (due July 2): total payable ₱90,000."],
  }),
  caseOf({
    form: "1800", level: "difficult", year: 2025, title: "Mortgaged land, donated and filed late",
    story: ["Anselmo B. Domingo (Barangay Maligaya, Gapan City 3105) donated to his nephew Joel D. Domingo, on March 3, 2025, a parcel of land with a fair market value of ₱5,000,000 that is mortgaged for ₱800,000; the donee assumed the mortgage. It is his only gift of the year.",
      "The return was due April 2, 2025. He files and pays on April 23, 2025, 21 days late. The general penalty rates apply (25% surcharge, 12% interest a year by the day over 365); the compromise assessed is ₱5,000. Fill in BIR Form 1800."],
    profile: P(253, "027", "DOMINGO, ANSELMO, BAUTISTA", "BRGY. MALIGAYA, GAPAN CITY, NUEVA ECIJA", "3105", "DOMINGO, JOEL, ROSALES", "NEPHEW"),
    facts: { ...common, "1": "03/03/2025", g1A: "5000000", g3A: "800000", g16A: "5000" },
    filing: "2025-04-23", klass: "large",
    why: "The tax on a donation is reported with Form 1800, even when late.",
    hints: ["The mortgage assumed by the donee is a deduction from the gross gift.", "Apply the ₱250,000 exemption to the net gift.", "April 2 to April 23 is 21 days."],
    solution: ["Net gift = ₱5,000,000 − ₱800,000 = ₱4,200,000. Taxable net gifts = ₱4,200,000 − ₱250,000 = ₱3,950,000. Donor's tax = 6% × ₱3,950,000 = ₱237,000.", "Surcharge = 25% × ₱237,000 = ₱59,250. Interest = ₱237,000 × 12% × 21 ÷ 365 = ₱1,636.27 → ₱1,636. Compromise ₱5,000. Total penalties ₱65,886. Total amount payable = ₱302,886."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1800: Donor's Tax Return", minutes: "About 6 minutes",
  sections: [
    ["1. What donor's tax is", "Donor's tax is a tax on the transfer of property by gift (a donation) during the donor's life. Under the TRAIN law it is a flat 6% on the total net gifts of a calendar year in excess of ₱250,000, whoever the donee is. The donor files Form 1800 within 30 days after each donation (Code Sec. 103) and pays the tax. IMPORTANT: this lab could not download the official Form 1800 from the BIR, so the form here follows the Code and uses descriptive item labels; the instructor should check it against the form in the eBIRForms package."],
    ["2. The cumulative computation", "Net gifts are the fair market value of the property given, less exempt gifts (for example gifts to the government and to accredited non-stock, non-profit organizations) and less allowable deductions such as an encumbrance the donee assumes. Because the ₱250,000 exemption applies to the whole calendar year, each new donation is added to the net gifts earlier in the year; the tax is computed on the total taxable net gifts and the donor's tax already paid on earlier gifts is subtracted. A late return adds surcharge, interest and compromise on the tax payable (25% and 12% a year; donors who are individuals are not micro or small business taxpayers)."],
  ],
  worked: { intro: "A donor gives property worth ₱600,000 and has made no other gift this year.", steps: ["Taxable net gifts = ₱600,000 − ₱250,000 = ₱350,000; tax = 6% = ₱21,000."], title: "Form 1800", table: { "Gifts-4": "600,000", "Gifts-7": "250,000", "Gifts-8": "350,000", "Gifts-9": "21,000", "Gifts-13": "21,000" } },
  legal: ["NIRC Sec. 98 to 104 (donor's tax), Sec. 99 as amended by RA 10963 (6% above ₱250,000), Sec. 103 (filing within 30 days after the gift); BIR Form 1800."],
  guide: [
    ["Date, donor, donee", "1", "Date of donation, amended, sheets, donor's TIN, RDO, name and address; donee's name, TIN and relationship; non-resident alien?", "Deed of donation.", "Using the date of filing."],
    ["Gifts-1 to 4", "g1A", "Gross gift, exempt gifts, allowable deductions; net gift is computed.", "Deed, appraisals.", "Not deducting the assumed mortgage."],
    ["Gifts-5 to 8", "g5A", "Net gifts earlier in the year; total, the ₱250,000 exemption and taxable net gifts are computed.", "Earlier returns.", "Giving the exemption twice."],
    ["Gifts-9 to 13", "g10A", "Computed 6% tax on the year; donor's tax paid on earlier gifts; tax payable.", "Earlier returns.", "Forgetting the earlier payment."],
    ["Penalties", "g16A", "Surcharge and interest from the filing date; compromise typed.", "Filing date.", "Late filing."],
  ],
  checklist: ["List every gift of the calendar year.", "Value each at FMV.", "Identify exempt gifts.", "File within 30 days of each gift."],
  pitfalls: ["Annual exemption applied per gift.", "Forgetting earlier gifts.", "Taxing exempt gifts."],
  amended: "Tick Yes and enter the tax paid in the original return.",
  noPayment: "Gifts below the annual exemption still require a return in practice; check with the RDO.",
  quiz: [
    ["The donor's tax rate under TRAIN is:", ["6%", "10%", "20%", "Graduated"], 0, "A flat 6%."],
    ["The annual exemption is:", ["₱100,000", "₱250,000", "₱500,000", "₱1,000,000"], 1, "₱250,000 of net gifts a calendar year."],
    ["The donor's tax return is filed within:", ["10 days", "30 days after the gift", "60 days", "1 year"], 1, "30 days after the gift."],
    ["Net gifts ₱1,000,000 in a year. Tax?", ["₱45,000", "₱60,000", "₱75,000", "₱0"], 0, "6% × (₱1,000,000 − ₱250,000)."],
    ["A gift to an accredited non-profit foundation is:", ["Taxable", "Exempt", "Half-taxed", "Deferred"], 1, "Exempt."],
  ],
});
