// BIR Form 1606, January 2018 (ENCS): Withholding Tax Remittance Return for onerous transfer of real property other than capital assets (ordinary assets).
// Item numbers follow docs/bir-forms/1606-Jan-2018.pdf; Schedule 4 prints the rates (exempt / 1.5% / 3% / 5% / 6%). The PDF has no instruction page: the deadline
// (10th day of the month after the transaction) is flagged as unverified in rules/2026.ts. Simplified: one property in Schedule 1, cash sale only.
import { RULES } from "../rules/2026";
import { isIso, roundToPeso, usToIso } from "../engine/tax";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { caseOf, dayOfNextMonth, lessonOf } from "./kit";

const RATE: Record<string, number> = { exempt: 0, r15: 0.015, r3: 0.03, r5: 0.05, r6: 0.06 };
function dueOf(v: Values): string {
  const d = usToIso(v["1"]);
  if (!isIso(d)) return "";
  return dayOfNextMonth(Number(d.slice(0, 4)), Number(d.slice(5, 7)), RULES.realPropertyWithholding.dueDayNextMonth);
}

export const DEF = makeForm({
  id: "1606", number: "1606", title: "Withholding Tax Remittance Return", subtitle: "Onerous transfer of real property other than capital assets (ordinary assets)",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 1606 Jan 2018 ENCS Final version. Rates from Schedule 4 of the form; the deadline is not printed on the PDF.",
  identity: [
    fields(f("1", "1", "Date of Transaction (MM/DD/YYYY)", "date", { span: 4, required: true }), yes("2", "2", "Amended Return?", 3), yes("3", "3", "Any Taxes Withheld?", 3), f("4", "4", "Number of Sheet/s Attached", "count", { span: 2, required: true })),
    fields(f("5", "5", "RDO Code of Location of Property", "rdo", { span: 4, required: true }), f("6", "6", "Category of Withholding Agent", "radio", { span: 8, options: opts(["private", "Private"], ["government", "Government"]), required: true })),
    fields(f("7", "7", "Buyer's (Withholding Agent's) Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("7A", "7A", "Buyer's Registered Address", "text", { span: 7, required: true }), f("7B", "7B", "ZIP Code", "zip", { span: 2, required: true }), f("7C", "7C", "Buyer's TIN", "tin", { span: 3, required: true })),
    fields(f("8", "8", "Seller's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("8A", "8A", "Seller's Registered Address", "text", { span: 7, required: true }), f("8B", "8B", "ZIP Code", "zip", { span: 2, required: true }), f("8C", "8C", "Seller's TIN", "tin", { span: 3, required: true })),
    radio("9", "9", "ATC / Tax Rate (Schedule 4)", opts(["exempt", "Socialized housing registered with HLURB/HUDCC (selling price of house and lot up to P450,000, lot up to P180,000): Exempt"], ["r15", "Habitual real estate seller: selling price P500,000 or less - 1.5%"], ["r3", "Habitual real estate seller: more than P500,000 but not more than P2,000,000 - 3.0%"], ["r5", "Habitual real estate seller: more than P2,000,000 - 5.0%"], ["r6", "Seller not habitually engaged in real estate business - 6.0%"])),
    fields(yes("10", "10", "Does the selling price cover more than one property?", 6), yes("11", "11", "Are you availing of tax relief under an International Tax Treaty or Special Law?", 6)),
  ],
  required: ["1", "2", "3", "4", "5", "6", "7", "7A", "7B", "7C", "8", "8A", "8B", "8C", "9", "10", "11"].map((id) => ({ id, message: id === "4" ? "Enter the number of sheets attached (0 if none)." : `Item ${id} is required.` })),
  formats: { tin: ["7C", "8C"], rdo: ["5"], zip: ["7B", "8B"] },
  sections: [
    { id: "s1", title: "Part IV – Schedule 1: Brief Description of Property (one property)", lines: [
      { id: "f1", item: "Sch.1-TD", label: "Fair Market Value (FMV) per Tax Declaration" },
      { id: "f2", item: "Sch.1-Zonal", label: "FMV per BIR (Zonal Value)" },
      { id: "f3", item: "Sch.1-FMV", label: "Fair Market Value (whichever is higher) (To Schedule 3 Item 1B)", f: (c) => Math.max(c.n("f1"), c.n("f2")) },
    ] },
    { id: "s3", title: "Part IV – Schedule 3: Determination of Taxable Base", lines: [
      { id: "g1", item: "Sch.3-1A", label: "Gross Selling Price / Bid Price for foreclosure sale" },
      { id: "g1b", item: "Sch.3-1B", label: "Total Fair Market Value of Land and Improvement per Schedule 1", f: (c) => c.n("f3") },
      { id: "g2", item: "Sch.3-2", label: "Taxable Base (for cash/foreclosure sale: Item A or B, whichever is higher) (To Part II Item 12)", f: (c) => Math.max(c.n("g1"), c.n("g1b")), bold: true, key: true },
    ] },
    { id: "p2", title: "Part II – Computation of Tax", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "12", item: "12", label: "Taxable Base (From Part IV Schedule 3 Item 2)", f: (c) => c.n("g2") },
      { id: "14", item: "14", label: "Tax Due (Item 12 multiplied by the rate in Item 13, from Schedule 4)", f: (c) => roundToPeso(Math.round(c.n("12") * (RATE[c.text("9")] ?? 0))), bold: true, key: true },
      { id: "15", item: "15", label: "Less: Tax paid in previously filed return, if this is an amended return" },
      { id: "16", item: "16", label: "Required Tax to be Withheld (Item 14 Less Item 15)", f: (c) => c.n("14") - c.n("15"), bold: true },
      { heading: "Add: Penalties" },
      { id: "17A", item: "17A", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "17B", item: "17B", label: "Interest", f: () => 0, indent: 1 },
      { id: "17C", item: "17C", label: "Compromise", indent: 1 },
      { id: "17D", item: "17D", label: "Total Penalties (Sum of Items 17A to 17C)", f: () => 0 },
      { id: "18", item: "18", label: "TOTAL AMOUNT PAYABLE/(Over remittance) (Sum of Items 16 and 17D)", f: () => 0, bold: true, key: true },
    ] },
  ],
  split: 1,
  penalty: { base: "16", surcharge: "17A", interest: "17B", compromise: "17C", total: "17D", grand: "18", gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v, _ctx, computed): Issue[] => {
    const out: Issue[] = [];
    const base = Number(computed["g2A"] ?? 0);
    if (v["9"] === "r15" && base > 500_000) out.push({ id: "9", item: "9", message: "1.5% is for a taxable base of P500,000 or less. Check the base." });
    if (v["9"] === "r3" && (base <= 500_000 || base > 2_000_000)) out.push({ id: "9", item: "9", message: "3.0% is for a taxable base above P500,000 up to P2,000,000." });
    if (v["9"] === "r5" && base <= 2_000_000) out.push({ id: "9", item: "9", message: "5.0% is for a taxable base above P2,000,000." });
    if (v["2"] === "yes" && !(Number(v["15A"]) > 0)) out.push({ id: "15A", item: "15", message: "This is an amended return: enter the tax paid in the return previously filed (Item 15)." });
    return out;
  },
  scoreExtra: [{ id: "9", weight: 3 }],
});

const P = (n: number, rdo: string, buyer: string, seller: string): Values => ({ "5": rdo, "6": "private", "7": buyer, "7A": "POBLACION, CABANATUAN CITY, NUEVA ECIJA", "7B": "3100", "7C": `000-${n}-888-00000`, "8": seller, "8A": "BRGY. MAYAPYAP, CABANATUAN CITY, NUEVA ECIJA", "8B": "3100", "8C": `000-${n}-999-00000` });
const common = { "2": "no", "3": "yes", "4": "1", "10": "no", "11": "no" } as const;

export const CASES = [
  caseOf({
    form: "1606", level: "easy", year: 2025, title: "A developer sells a low-cost lot",
    story: ["Rosario Homes Development Corp., a real estate developer (habitual seller, Cabanatuan City), sold a subdivision lot (ordinary asset) to buyer Eduardo T. Navarro (the withholding agent) on March 12, 2025 for ₱450,000. The tax declaration shows ₱300,000 and the BIR zonal value is ₱400,000. It is not registered socialized housing.", "The buyer files the 1606 and pays the withholding tax on April 8, 2025. Fill in BIR Form 1606."],
    profile: P(211, "025", "NAVARRO, EDUARDO, TAN", "ROSARIO HOMES DEVELOPMENT CORP."),
    facts: { ...common, "1": "03/12/2025", "9": "r15", f1A: "300000", f2A: "400000", g1A: "450000" },
    filing: "2025-04-08", klass: "large",
    why: "The tax withheld on the sale of an ordinary-asset real property is remitted with Form 1606 (not 1706).",
    hints: ["The taxable base is the higher of the selling price and the FMV (the higher of TD and zonal value).", "A habitual seller with a base up to ₱500,000: 1.5%.", "Ordinary assets use 1606; capital assets use 1706."],
    solution: ["FMV = higher of ₱300,000 and ₱400,000 = ₱400,000. Gross selling price ₱450,000. Taxable base (Item 12) = ₱450,000.", "Tax due (Item 14) = 1.5% × ₱450,000 = ₱6,750. Filed before the 10th of April: Item 18 = ₱6,750."],
  }),
  caseOf({
    form: "1606", level: "average", year: 2025, title: "Zonal value above the price",
    story: ["Cabanatuan Property Ventures, Inc. (habitual real estate seller) sold a commercial lot (ordinary asset) to San Jose Land Holdings Corp. on June 20, 2025 for ₱1,200,000. Tax declaration ₱900,000; BIR zonal value ₱1,500,000.", "The buyer files and remits on July 9, 2025. Fill in BIR Form 1606."],
    profile: P(212, "025", "SAN JOSE LAND HOLDINGS CORP.", "CABANATUAN PROPERTY VENTURES, INC."),
    facts: { ...common, "1": "06/20/2025", "9": "r3", f1A: "900000", f2A: "1500000", g1A: "1200000" },
    filing: "2025-07-09", klass: "large",
    why: "The tax withheld on the sale of an ordinary-asset real property is remitted with Form 1606.",
    hints: ["Use the zonal value when it is higher than the selling price.", "Base above ₱500,000 up to ₱2,000,000: 3.0%.", "The base is ₱1,500,000."],
    solution: ["FMV = ₱1,500,000 (zonal). Taxable base (Item 12) = higher of ₱1,200,000 and ₱1,500,000 = ₱1,500,000.", "Tax due (Item 14) = 3.0% × ₱1,500,000 = ₱45,000. On time: Item 18 = ₱45,000."],
  }),
  caseOf({
    form: "1606", level: "difficult", year: 2025, title: "A non-habitual seller, filed late",
    story: ["Lacson Cold Storage Corp., not habitually engaged in real estate, sold a warehouse building and lot used in its business (ordinary asset) to Gapan Logistics, Inc. on August 15, 2025 for ₱6,000,000. Tax declaration ₱5,000,000; BIR zonal value ₱7,500,000.",
      "The 1606 and the withholding were due September 10, 2025. The buyer files and remits on October 6, 2025, 26 days late. The general penalty rates apply (25% surcharge, 12% interest a year by the day over 365); compromise ₱5,000. Fill in BIR Form 1606."],
    profile: P(213, "027", "GAPAN LOGISTICS, INC.", "LACSON COLD STORAGE CORP."),
    facts: { ...common, "1": "08/15/2025", "9": "r6", f1A: "5000000", f2A: "7500000", g1A: "6000000", "17CA": "5000" },
    filing: "2025-10-06", klass: "large",
    why: "The tax withheld on the sale of an ordinary-asset real property is remitted with Form 1606, even when late.",
    hints: ["A seller not habitually engaged in real estate: 6.0%.", "The base is the higher of the price and the higher FMV.", "September 10 to October 6 is 26 days."],
    solution: ["FMV = ₱7,500,000. Taxable base (Item 12) = higher of ₱6,000,000 and ₱7,500,000 = ₱7,500,000. Tax due (Item 14) = 6% × ₱7,500,000 = ₱450,000.", "Surcharge = 25% × ₱450,000 = ₱112,500. Interest = ₱450,000 × 12% × 26 ÷ 365 = ₱3,846.58 → ₱3,847. Compromise ₱5,000. Total penalties ₱121,347. Item 18 = ₱571,347."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1606: Withholding Tax Remittance Return (real property, ordinary asset)", minutes: "About 6 minutes",
  sections: [
    ["1. When 1606 is used", "When real property classified as an ORDINARY asset (used in business, or held for sale by a real estate dealer) is sold, the sale is part of the seller's income, and the BUYER withholds an income tax at source from the price and remits it with Form 1606. (If the property is a capital asset, the seller files Form 1706 for the 6% capital gains tax instead.) The withholding tax is credited against the seller's income tax. The deadline is not printed on the PDF; the lab teaches the 10th day of the month after the transaction (see the rules file)."],
    ["2. Base and rate", "The taxable base is the higher of the gross selling price and the fair market value; the fair market value is the higher of the tax declaration value and the BIR zonal value (Schedule 3). The rate comes from Schedule 4 of the form: exempt for registered socialized housing (house and lot up to ₱450,000, lot only up to ₱180,000); for a seller habitually engaged in the real estate business, 1.5% if the selling price is ₱500,000 or less, 3.0% if more than ₱500,000 up to ₱2,000,000, and 5.0% if more than ₱2,000,000; and 6.0% if the seller is not habitually engaged in real estate. The required tax to be withheld (Item 16) is the tax due less any paid in an earlier return if amended. A late return adds surcharge, interest and compromise."],
  ],
  worked: { intro: "A habitual seller sells a lot for ₱1,000,000; zonal value ₱800,000, TD ₱600,000.", steps: ["FMV ₱800,000; base = ₱1,000,000. Rate 3.0%: ₱30,000."], title: "Form 1606", table: { "Sch.3 base": "1,000,000", "12": "1,000,000", "14": "30,000", "18": "30,000" } },
  legal: ["NIRC Sec. 57(A) and RR 2-98 (creditable withholding tax on sales of real property classified as ordinary asset); BIR Form 1606 (January 2018 ENCS), Schedule 4."],
  guide: [
    ["1 to 6", "1", "Date of transaction, amended, any taxes withheld, sheets, RDO of the property, category.", "Deed of sale.", "RDO of the buyer."],
    ["7 and 8", "7", "Buyer's and seller's names, addresses, ZIP and TINs.", "Deed.", "Swapping buyer and seller."],
    ["9", "9", "The ATC / tax rate per Schedule 4.", "Seller's business.", "6% for a habitual seller."],
    ["Sch. 1 and 3", "f1A", "FMV per tax declaration and zonal value; gross selling price; the base is computed.", "Tax declaration, zonal values.", "Using the price alone."],
    ["12 to 18", "15", "Computed tax at the rate; tax paid if amended; penalties from the filing date; compromise typed.", "Filing date.", "Applying 6% to a developer."],
  ],
  checklist: ["Is the property an ordinary asset?", "Is the seller a habitual real estate seller?", "Find the zonal value.", "Remit by the deadline."],
  pitfalls: ["1606 vs 1706.", "Wrong seller category.", "Ignoring the zonal value.", "Late remittance."],
  amended: "Tick Yes in Item 2 and enter the tax paid in the earlier return in Item 15.",
  noPayment: "Exempt socialized housing has no tax, but the return is still filed.",
  quiz: [
    ["Ordinary-asset real property sale: the buyer remits with:", ["1706", "1606", "1707", "2550Q"], 1, "Form 1606."],
    ["A habitual seller, base ₱1,500,000: the rate is:", ["1.5%", "3.0%", "5.0%", "6.0%"], 1, "3.0% for more than ₱500,000 up to ₱2,000,000."],
    ["A seller not habitually engaged in real estate: the rate is:", ["1.5%", "3.0%", "5.0%", "6.0%"], 3, "6.0%."],
    ["Price ₱1,000,000; zonal ₱1,400,000. The base is:", ["₱1,000,000", "₱1,400,000", "₱2,400,000", "₱400,000"], 1, "The higher."],
    ["Who withholds?", ["The seller", "The buyer", "The BIR", "The bank"], 1, "The buyer."],
  ],
});
