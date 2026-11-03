// BIR Form 2000-OT, January 2018 (ENCS): Documentary Stamp Tax Declaration/Return (one-time transactions).
// Item numbers follow docs/bir-forms/2000-OT-Jan-2018.pdf; printed rates: shares with par value P1.50 per P200 (DO 102) and deeds of sale or donation of real property P15 per P1,000 (DO 122).
// Simplified: one real property or one stock line. The 5th-day deadline is not printed on the PDF (rules/2026.ts flags it).
import { RULES } from "../rules/2026";
import { isIso, usToIso } from "../engine/tax";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { dstTax } from "./f2000";
import { caseOf, dayOfNextMonth, lessonOf } from "./kit";

function dueOf(v: Values): string {
  const d = usToIso(v["1"]);
  return isIso(d) ? dayOfNextMonth(Number(d.slice(0, 4)), Number(d.slice(5, 7)), RULES.dst.dueDay) : "";
}

export const DEF = makeForm({
  id: "2000-OT", number: "2000-OT", title: "Documentary Stamp Tax Declaration/Return", subtitle: "One-time transactions (sale or transfer of shares of stock or real property)",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 2000-OT January 2018 ENCS v3. Rates printed on the form; the 5th-day deadline is the Code and the user's table.",
  identity: [
    fields(f("1", "1", "Date of Transaction (MM/DD/YYYY)", "date", { span: 4, required: true }), yes("2", "2", "Amended Return?", 3), f("3", "3", "Alphanumeric Tax Code (ATC)", "radio", { span: 3, options: opts(["DO102", "DO 102 Shares of stock with par value"], ["DO122", "DO 122 Deeds of sale/conveyance/donation of real property"]), required: true }), f("4", "4", "Number of Sheet/s Attached", "count", { span: 2, required: true })),
    fields(f("5", "5", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("6", "6", "RDO Code of Location of the Property", "rdo", { span: 5, required: true })),
    fields(f("7", "7", "Taxpayer's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("8", "8", "Registered Address", "text", { span: 9, required: true }), f("8A", "8A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("9", "9", "Contact Number", "phone", { span: 5 }), f("10", "10", "Email Address", "email", { span: 7 })),
    fields(f("11", "11", "Other Party to the Transaction", "radio", { span: 12, options: opts(["seller", "Seller/Transferor/Donor"], ["buyer", "Buyer/Transferee/Donee"]), required: true })),
    fields(f("11A", "11A", "Name of the other party", "text", { span: 8, required: true }), f("11B", "11B", "TIN of the other party", "tin", { span: 4, required: true })),
    radio("12", "12", "Nature of Transaction", opts(["shares", "Transfer of shares of stock not traded through the local stock exchange"], ["capital", "Transfer of real property classified as capital asset"], ["ordinary", "Transfer of real property other than capital asset"])),
    fields(f("13", "13", "Location of Real Property (if sale/transfer/donation of real property)", "text", { span: 12 })),
  ],
  required: ["1", "2", "3", "4", "5", "6", "7", "8", "8A", "11", "11A", "11B", "12"].map((id) => ({ id, message: id === "4" ? "Enter the number of sheets attached (0 if none)." : `Item ${id} is required.` })),
  formats: { tin: ["5", "11B"], rdo: ["6"], zip: ["8A"], email: ["10"] },
  sections: [
    { id: "s2", title: "Part IV – Schedule 2: Determination of Taxable Base for Real Property", lines: [
      { id: "g1", item: "Sch.2-1A", label: "Gross Selling Price / Bid Price for foreclosure sale / Net Gift" },
      { id: "g2", item: "Sch.2-1B", label: "Fair Market Value (higher of the tax declaration and the BIR zonal value)" },
      { id: "g3", item: "Sch.2-2", label: "Taxable Base (higher of Items 1A and 1B) (To Part II Item 15)", f: (c) => Math.max(c.n("g1"), c.n("g2")) },
    ] },
    { id: "p2", title: "Part II – Computation of Tax", note: "Centavos are allowed on documentary stamp tax.", lines: [
      { id: "14", item: "14", label: "Taxable Base - Shares of Stock (par value, from Schedule 1.B)" },
      { id: "15", item: "15", label: "Taxable Base - Real Property (From Part IV Schedule 2 Item 2)", f: (c) => c.n("g3") },
      { id: "17", item: "17", label: "Tax Due (Item 14 or 15 x Item 16, the rate of the ATC)", f: (c) => (c.text("3") === "DO102" ? dstTax("DO102", c.n("14")) : dstTax("DO122", c.n("15"))), bold: true, key: true },
      { id: "18", item: "18", label: "Less: Tax Paid in Return previously filed, if this is an amended return" },
      { id: "19", item: "19", label: "Tax Still Due/(Overpayment) (Item 17 less Item 18)", f: (c) => c.n("17") - c.n("18"), bold: true },
      { heading: "Add: Penalties" },
      { id: "20A", item: "20A", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "20B", item: "20B", label: "Interest", f: () => 0, indent: 1 },
      { id: "20C", item: "20C", label: "Compromise", indent: 1 },
      { id: "20D", item: "20D", label: "Total Penalties (Sum of Items 20A to 20C)", f: () => 0 },
      { id: "21", item: "21", label: "Total Amount Payable/(Overpayment) (Sum of Items 19 and 20D)", f: () => 0, bold: true, key: true },
    ] },
  ],
  split: 1,
  penalty: { base: "19", surcharge: "20A", interest: "20B", compromise: "20C", total: "20D", grand: "21", gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    if (v["3"] === "DO102" && v["12"] && v["12"] !== "shares") out.push({ id: "3", item: "3", message: "ATC DO 102 is for shares of stock; Item 12 says real property." });
    if (v["3"] === "DO122" && v["12"] === "shares") out.push({ id: "3", item: "3", message: "ATC DO 122 is for real property; Item 12 says shares of stock." });
    if (v["3"] === "DO122" && !(v["13"] ?? "").trim()) out.push({ id: "13", item: "13", message: "Enter the location of the real property." });
    if (v["2"] === "yes") out.push({ id: "2", item: "2", message: "This lab files the original return only." });
    return out;
  },
  scoreExtra: [{ id: "3", weight: 3 }],
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string, other: string, side: string): Values => ({ "5": `000-${n}-246-00000`, "6": rdo, "7": name, "8": addr, "8A": zip, "9": `0917000${n}`, "10": `ot${n}@example.com`, "11": side, "11A": other, "11B": "000-246-135-00000" });
const common = { "2": "no", "4": "2" } as const;

export const CASES = [
  caseOf({
    form: "2000-OT", level: "easy", year: 2025, title: "DST on the sale of a lot",
    story: ["Benigno P. Valdez (Barangay Aduas Norte, Cabanatuan City 3100), the buyer, purchased a residential lot in Talavera, Nueva Ecija (a capital asset of the seller) from Corazon R. Santos on May 14, 2025 for ₱2,000,000; the BIR zonal value is ₱1,800,000. The buyer files the DST return on June 4, 2025.", "Fill in BIR Form 2000-OT."],
    profile: P(231, "027", "VALDEZ, BENIGNO, PASCUAL", "BRGY. ADUAS NORTE, CABANATUAN CITY, NUEVA ECIJA", "3100", "SANTOS, CORAZON, REYES", "seller"),
    facts: { ...common, "1": "05/14/2025", "3": "DO122", "12": "capital", "13": "BRGY. SAN PEDRO, TALAVERA, NUEVA ECIJA", g1A: "2000000", g2A: "1800000" },
    filing: "2025-06-04", klass: "large",
    why: "The documentary stamp tax on a one-time sale of real property is declared with Form 2000-OT.",
    hints: ["The base is the higher of the price and the FMV.", "DO 122: ₱15 for each ₱1,000 or fraction.", "The deadline is the 5th day after the end of the month of the transaction."],
    solution: ["Taxable base = higher of ₱2,000,000 and ₱1,800,000 = ₱2,000,000.", "DST (Item 17) = (₱2,000,000 ÷ ₱1,000) × ₱15 = 2,000 × ₱15 = ₱30,000. On time (due June 5): Item 21 = ₱30,000."],
  }),
  caseOf({
    form: "2000-OT", level: "average", year: 2025, title: "DST on a transfer of shares",
    story: ["Marites S. Dizon (Barangay Pagas, Cabanatuan City 3100) transferred 15,000 shares of Dizon Agri Corp., an unlisted domestic corporation, with a total par value of ₱1,500,000, to Roberto M. Cruz on August 12, 2025 (DO 102). She files the DST return on September 3, 2025.", "Fill in BIR Form 2000-OT."],
    profile: P(232, "025", "DIZON, MARITES, SALAZAR", "BRGY. PAGAS, CABANATUAN CITY, NUEVA ECIJA", "3100", "CRUZ, ROBERTO, MANGUBAT", "buyer"),
    facts: { ...common, "1": "08/12/2025", "3": "DO102", "12": "shares", "14A": "1500000" },
    filing: "2025-09-03", klass: "large",
    why: "The documentary stamp tax on a one-time transfer of shares is declared with Form 2000-OT.",
    hints: ["Shares with par value: ₱1.50 per ₱200 of par value.", "The base is par value, not the selling price.", "₱1,500,000 ÷ ₱200 = 7,500 units."],
    solution: ["Taxable base (Item 14) = par value ₱1,500,000.", "DST (Item 17) = 7,500 × ₱1.50 = ₱11,250. On time (due September 5): Item 21 = ₱11,250."],
  }),
  caseOf({
    form: "2000-OT", level: "difficult", year: 2025, title: "Zonal value above the price, filed late",
    story: ["Danilo C. Lim (Barangay Sibut, San Jose City 3121) bought a commercial lot in Gapan City from Rosalinda T. Co on October 16, 2025 for ₱3,500,000. The BIR zonal value is ₱4,100,000 (the tax declaration shows ₱3,000,000, so FMV is ₱4,100,000).",
      "The DST return was due November 5, 2025. He files and pays on December 1, 2025, 26 days late. The general penalty rates apply (25% surcharge, 12% interest a year by the day over 365); the compromise assessed is ₱2,000. Fill in BIR Form 2000-OT."],
    profile: P(233, "027", "LIM, DANILO, CHUA", "BRGY. SIBUT, SAN JOSE CITY, NUEVA ECIJA", "3121", "CO, ROSALINDA, TAN", "seller"),
    facts: { ...common, "1": "10/16/2025", "3": "DO122", "12": "capital", "13": "BRGY. BULAK, GAPAN CITY, NUEVA ECIJA", g1A: "3500000", g2A: "4100000", "20CA": "2000" },
    filing: "2025-12-01", klass: "large",
    why: "The documentary stamp tax on a one-time sale of real property is declared with Form 2000-OT, even when late.",
    hints: ["Use the zonal value: it is higher than the price.", "₱4,100,000 ÷ ₱1,000 = 4,100 units × ₱15.", "Penalties are computed on the tax still due (Item 19)."],
    solution: ["Taxable base = ₱4,100,000. DST (Item 17) = 4,100 × ₱15 = ₱61,500.", "Surcharge = 25% × ₱61,500 = ₱15,375. Interest = ₱61,500 × 12% × 26 ÷ 365 = ₱525.70 → ₱526. Compromise ₱2,000. Total penalties ₱17,901. Item 21 = ₱79,401."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 2000-OT: Documentary Stamp Tax Declaration/Return (one-time transactions)", minutes: "About 5 minutes",
  sections: [
    ["1. When 2000-OT is used", "Documentary stamp tax also applies to one-time transactions: the sale, transfer or donation of real property, and the sale or transfer of shares of stock. These are declared with Form 2000-OT, per transaction, instead of the monthly Form 2000. The form's DST table gives the rates: shares of stock with par value, ₱1.50 for each ₱200 or fraction of par value (ATC DO 102), and deeds of sale, conveyance and donation of real property, ₱15 for each ₱1,000 or fraction of the consideration or the fair market value, whichever is higher (ATC DO 122). The deadline is taught as the fifth (5th) day after the end of the month of the transaction (not printed on the PDF; see the rules file)."],
    ["2. Computing", "For real property, the base is the higher of the gross selling price (or net gift) and the fair market value, which is itself the higher of the tax declaration and the BIR zonal value (Schedule 2). For shares, the base is par value (Schedule 1.B). The tax due is the number of units (each ₱200 or ₱1,000 or fraction, rounded up) times the rate. A late return adds a surcharge, interest and compromise on the tax still due (25% and 12% in general; 10% and 6% for micro and small taxpayers)."],
  ],
  worked: { intro: "A lot is sold for ₱1,500,000; zonal value ₱1,200,000.", steps: ["Base ₱1,500,000; units 1,500 × ₱15 = ₱22,500."], title: "Form 2000-OT", table: { "Sch.2 base": "1,500,000", "15": "1,500,000", "17": "22,500", "21": "22,500" } },
  legal: ["NIRC Sec. 196 (deeds of sale and conveyances of real property, ₱15 per ₱1,000 as amended), Sec. 176 (sales and transfers of shares), Sec. 200; BIR Form 2000-OT (January 2018 ENCS)."],
  guide: [
    ["1 to 4", "1", "Date of transaction, amended, ATC (DO 102 shares, DO 122 real property), sheets.", "Deed.", "Wrong ATC."],
    ["5 to 13", "5", "TIN, RDO of the property, names, address, other party, nature of transaction, location.", "Deed.", "Missing the location."],
    ["Sch. 2", "g1A", "Gross selling price and FMV for real property; the base is computed.", "Deed, zonal values.", "Using the lower of the two."],
    ["14 to 19", "14A", "Shares: par value. Computed tax due; tax paid if amended.", "Stock certificate.", "Using the selling price for shares."],
    ["20 and 21", "20CA", "Penalties from the filing date; compromise typed.", "Filing date.", "Applying them to an on-time return."],
  ],
  checklist: ["Is it shares or real property?", "Get par value or FMV.", "Count units rounded up.", "File by the 5th of the next month."],
  pitfalls: ["Par value vs price.", "Lower base chosen.", "Units not rounded up."],
  amended: "This lab files the original return only.",
  noPayment: "A donation still bears DST, computed on the net gift or FMV.",
  quiz: [
    ["DST on real property is:", ["₱1.50 per ₱200", "₱15 per ₱1,000", "6%", "12%"], 1, "P15 per P1,000 or fraction."],
    ["Par value of shares ₱400,000. DST?", ["₱3,000", "₱6,000", "₱600", "₱4,000"], 0, "2,000 units × ₱1.50 = ₱3,000."],
    ["The base for real property is:", ["The lower of price and FMV", "The higher of price and FMV", "The tax declaration only", "The zonal value only"], 1, "The higher."],
    ["Form 2000-OT is used for:", ["Monthly loans", "One-time transactions", "Insurance", "Quarterly VAT"], 1, "One-time sale of real property or shares."],
    ["Units of ₱1,000 are counted:", ["Rounded down", "Rounded up", "Exactly", "Ignored"], 1, "Each ₱1,000 or fraction."],
  ],
});
