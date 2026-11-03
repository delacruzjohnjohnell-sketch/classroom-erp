// BIR Form 1706, January 2018 (ENCS): Capital Gains Tax Return for onerous transfer of real property classified as a capital asset.
// Item numbers follow docs/bir-forms/1706-Jan-2018.pdf. Simplified: one property in Schedule 1 (FMV per tax declaration and per BIR zonal value), cash sale only (Schedule 2 installment items not simulated).
import { RULES } from "../rules/2026";
import { addDays, caseOf, lessonOf } from "./kit";
import { isIso, roundToPeso, usToIso } from "../engine/tax";
import { f, fields, makeForm, opts, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";

const dateOf = (v: Values) => usToIso(v["1"]);
const dueOf = (v: Values) => { const d = dateOf(v); return isIso(d) ? addDays(d, RULES.capitalGains.dueDays) : ""; };
/** Principal residence with the proceeds to be used in a new residence: only the unutilized share is taxable (Schedule 3). */
const exemptRoute = (c: { text: (id: string) => string }) => c.text("8") === "yes" && c.text("9") === "yes";

export const DEF = makeForm({
  id: "1706", number: "1706", title: "Capital Gains Tax Return", subtitle: "For Onerous Transfer of Real Property Classified as Capital Asset - both Taxable and Exempt",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 1706 Jan 2018 ENCS Final. 6% printed on the form. Due within 30 days after each sale (Code Sec. 24(D); the PDF has no instruction page).",
  identity: [
    fields(f("1", "1", "Date of Transaction (MM/DD/YYYY)", "date", { span: 4, required: true }), yes("2", "2", "Amended Return?", 3), f("3", "3", "ATC", "radio", { span: 3, options: opts(["WI450", "WI 450 Individual"], ["WC450", "WC 450 Corporation"]), required: true }), f("4", "4", "Number of Sheet/s Attached", "count", { span: 2, required: true })),
    fields(f("5", "5", "RDO Code of Location of Property", "rdo", { span: 4, required: true })),
    fields(f("6", "6", "Seller's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("6A", "6A", "Seller's Registered Address", "text", { span: 7, required: true }), f("6B", "6B", "ZIP Code", "zip", { span: 2, required: true }), f("6C", "6C", "Seller's TIN", "tin", { span: 3, required: true })),
    fields(f("7", "7", "Buyer's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("7A", "7A", "Buyer's Registered Address", "text", { span: 7, required: true }), f("7B", "7B", "ZIP Code", "zip", { span: 2, required: true }), f("7C", "7C", "Buyer's TIN", "tin", { span: 3, required: true })),
    fields(yes("8", "8", "Is the property being sold your principal residence? (individual sellers only)", 6), yes("9", "9", "Do you intend to construct or acquire a new principal residence within 18 months from the date of sale?", 6)),
    fields(yes("10", "10", "Does the selling price cover more than one property?", 6), yes("11", "11", "Are you availing of tax relief under an International Tax Treaty or Special Law?", 6)),
  ],
  required: ["1", "2", "3", "4", "5", "6", "6A", "6B", "6C", "7", "7A", "7B", "7C", "8", "9", "10", "11"].map((id) => ({ id, message: id === "4" ? "Enter the number of sheets attached (0 if none)." : `Item ${id} is required.` })),
  formats: { tin: ["6C", "7C"], rdo: ["5"], zip: ["6B", "7B"] },
  sections: [
    { id: "s1", title: "Part IV – Schedule 1: Description of Transaction (one property)", lines: [
      { id: "f1", item: "Sch.1-col1", label: "Fair Market Value (FMV) per Tax Declaration (Column 1)" },
      { id: "f2", item: "Sch.1-col2", label: "FMV per BIR (Zonal Value) (Column 2)" },
      { id: "f3", item: "Sch.1-FMV", label: "Fair Market Value (whichever is higher between Columns 1 and 2) (To Schedule 4 Item 1B)", f: (c) => Math.max(c.n("f1"), c.n("f2")), key: true },
    ] },
    { id: "s3", title: "Part IV – Schedule 3: Unutilized portion of sales proceeds of a principal residence (if Items 8 and 9 are both Yes)", lines: [
      { id: "ut", item: "Sch.3-used", label: "Amount of the gross selling price utilized (or committed) for the new principal residence within 18 months" },
      { id: "nu", item: "Sch.3-unused", label: "Unutilized portion of the gross selling price (GSP less amount utilized)", f: (c) => (exemptRoute(c) ? Math.max(c.n("s1A") - c.n("ut"), 0) : 0), when: exemptRoute },
    ] },
    { id: "s4", title: "Part IV – Schedule 4: Determination of Taxable Base", lines: [
      { id: "s1A", item: "Sch.4-1A", label: "Gross Selling Price / Bid Price for Foreclosure Sale" },
      { id: "s1B", item: "Sch.4-1B", label: "Total FMV of Land and Improvement (From Schedule 1)", f: (c) => c.n("f3") },
      { id: "s2", item: "Sch.4-2", label: "Taxable Base (higher of Items 1A and 1B; for an exempt principal residence, the unutilized share of that amount)", f: (c) => { const hi = Math.max(c.n("s1A"), c.n("s1B")); return exemptRoute(c) ? (c.n("s1A") > 0 ? roundToPeso(Math.round((c.n("nu") / c.n("s1A")) * hi)) : 0) : hi; }, bold: true, key: true },
    ] },
    { id: "p2", title: "Part II – Computation of Tax", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "12", item: "12", label: "Taxable Base (From Part IV, Schedule 4 Item 2)", f: (c) => c.n("s2") },
      { id: "14", item: "14", label: "Tax Due (Item 12 multiplied by the 6% rate in Item 13)", f: (c) => roundToPeso(Math.round(c.n("12") * RULES.capitalGains.propertyRate)), key: true, bold: true },
      { id: "15", item: "15", label: "Less: Tax paid in previously filed return, if this is an amended return" },
      { id: "16", item: "16", label: "Tax Payable/(Overpayment) (Item 14 Less Item 15)", f: (c) => c.n("14") - c.n("15"), bold: true },
      { heading: "Add: Penalties" },
      { id: "17A", item: "17A", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "17B", item: "17B", label: "Interest", f: () => 0, indent: 1 },
      { id: "17C", item: "17C", label: "Compromise", indent: 1 },
      { id: "17D", item: "17D", label: "Total Penalties (Sum of Items 17A to 17C)", f: () => 0 },
      { id: "18", item: "18", label: "TOTAL AMOUNT PAYABLE/(Overremittance) (Sum of Items 16 and 17D)", f: () => 0, bold: true, key: true },
    ] },
  ],
  split: 1,
  penalty: { base: "16", surcharge: "17A", interest: "17B", compromise: "17C", total: "17D", grand: "18", cols: ["A"], gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    if (v["8"] === "yes" && v["3"] === "WC450") out.push({ id: "8", item: "8", message: "The principal residence question is for individual sellers only." });
    if (v["8"] === "yes" && v["9"] === "yes" && !(Number(v["utA"]) > 0)) out.push({ id: "utA", item: "Sch.3-used", message: "Enter the amount utilized (or committed) for the new principal residence, or answer No to Item 9." });
    if (v["2"] === "yes" && !(Number(v["15A"]) > 0)) out.push({ id: "15A", item: "15", message: "This is an amended return: enter the tax paid in the return previously filed (Item 15)." });
    if (v["3"] === "WI450" && /\b(INC|CORP|CORPORATION)\b/i.test(v["6"] ?? "")) out.push({ id: "3", item: "3", message: "The seller looks like a corporation: ATC WC 450." });
    return out;
  },
  scoreExtra: [{ id: "3", weight: 2 }],
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string, buyer: string, extra: Values = {}): Values => ({ "5": rdo, "6": name, "6A": addr, "6B": zip, "6C": `000-000-${n}-00000`, "7": buyer, "7A": "POBLACION, TALAVERA, NUEVA ECIJA", "7B": "3114", "7C": "000-777-888-00000", ...extra });
const common = { "2": "no", "3": "WI450", "4": "2", "10": "no", "11": "no" } as const;

export const CASES = [
  caseOf({
    form: "1706", level: "easy", year: 2025, title: "A vacant lot sold above its zonal value",
    story: ["Leonora S. Aquino (Barangay Mabini, Cabanatuan City 3100) sold a vacant residential lot in Talavera, Nueva Ecija, held as a capital asset, to Rodrigo M. Evangelista on June 10, 2025 for ₱2,000,000. Its fair market value per tax declaration is ₱1,200,000 and per BIR zonal value ₱1,800,000. It is not her principal residence.", "She files and pays within the 30 days, on July 8, 2025, with two attachments. Fill in BIR Form 1706."],
    profile: P(131, "027", "AQUINO, LEONORA, SANTOS", "BRGY. MABINI, CABANATUAN CITY, NUEVA ECIJA", "3100", "EVANGELISTA, RODRIGO, MALLARI"),
    facts: { ...common, "1": "06/10/2025", "8": "no", "9": "no", f1A: "1200000", f2A: "1800000", s1AA: "2000000" },
    filing: "2025-07-08", klass: "large",
    why: "The sale of a capital-asset real property is reported with Form 1706 (capital gains tax).",
    hints: ["The taxable base is the higher of the gross selling price and the FMV.", "FMV is the higher of the tax declaration and the zonal value.", "The rate is 6% of the taxable base, not of the gain."],
    solution: ["FMV (Schedule 1) = higher of ₱1,200,000 and ₱1,800,000 = ₱1,800,000. Selling price ₱2,000,000. Taxable base (Item 12) = ₱2,000,000 (the higher).", "Tax due (Item 14) = 6% × ₱2,000,000 = ₱120,000. Filed on day 28: no penalties. Item 18 = ₱120,000."],
  }),
  caseOf({
    form: "1706", level: "average", year: 2025, title: "Zonal value is higher than the price",
    story: ["Benito T. Lacson (Barangay Pagas, Cabanatuan City 3100) sold agricultural land held as a capital asset to Mabini Realty Corp. (a registered corporation) on August 5, 2025 for ₱1,500,000. The tax declaration shows ₱900,000 and the BIR zonal value is ₱2,400,000. It is not a principal residence.", "He files on August 30, 2025 and pays in full, with three attachments. Fill in BIR Form 1706."],
    profile: P(132, "027", "LACSON, BENITO, TAN", "BRGY. PAGAS, CABANATUAN CITY, NUEVA ECIJA", "3100", "MABINI REALTY CORP."),
    facts: { ...common, "1": "08/05/2025", "4": "3", "8": "no", "9": "no", f1A: "900000", f2A: "2400000", s1AA: "1500000" },
    filing: "2025-08-30", klass: "large",
    why: "The sale of a capital-asset real property is reported with Form 1706.",
    hints: ["Compare the price with the higher of TD and zonal value.", "The higher of the two is the taxable base.", "An individual seller uses ATC WI 450."],
    solution: ["FMV = higher of ₱900,000 and ₱2,400,000 = ₱2,400,000. Selling price ₱1,500,000. Taxable base = ₱2,400,000.", "Tax due = 6% × ₱2,400,000 = ₱144,000. Filed on day 25: Item 18 = ₱144,000."],
  }),
  caseOf({
    form: "1706", level: "difficult", year: 2025, title: "A principal residence partly reinvested, filed late",
    story: ["Marites C. Ocampo (Barangay Sibut, San Jose City 3121) sold her principal residence to Danilo R. Pascual on March 3, 2025 for ₱4,000,000. The tax declaration shows ₱2,500,000 and the zonal value is ₱3,500,000. She commits to buy a new principal residence within 18 months for ₱3,000,000, so only the unutilized part of the selling price is taxable.",
      "She files and pays on April 22, 2025, 20 days after the 30-day deadline (April 2). The regular late-filing rates apply: 25% surcharge and 12% interest a year by the day over 365; the compromise assessed is ₱1,000. Two attachments. Fill in BIR Form 1706."],
    profile: P(133, "026", "OCAMPO, MARITES, CRUZ", "BRGY. SIBUT, SAN JOSE CITY, NUEVA ECIJA", "3121", "PASCUAL, DANILO, REYES"),
    facts: { ...common, "1": "03/03/2025", "8": "yes", "9": "yes", f1A: "2500000", f2A: "3500000", s1AA: "4000000", utA: "3000000", "17CA": "1000" },
    filing: "2025-04-22", klass: "large",
    why: "The sale of a principal residence (capital asset) is reported with Form 1706, even when most of it is exempt.",
    hints: ["Items 8 and 9 Yes: Schedule 3 is used.", "Unutilized portion = GSP − amount used for the new residence.", "Taxable base = (unutilized ÷ GSP) × the higher of GSP and FMV."],
    solution: ["FMV = ₱3,500,000. GSP ₱4,000,000. Unutilized portion = ₱4,000,000 − ₱3,000,000 = ₱1,000,000, which is 25% of the GSP. Taxable base (Item 12) = 25% × ₱4,000,000 = ₱1,000,000.", "Tax due (Item 14) = 6% × ₱1,000,000 = ₱60,000. Due April 2; filed April 22 = 20 days late.", "Surcharge = 25% × ₱60,000 = ₱15,000. Interest = ₱60,000 × 12% × 20 ÷ 365 = ₱394.52 → ₱395. Compromise ₱1,000. Total penalties ₱16,395. Item 18 = ₱76,395."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1706: Capital Gains Tax Return (real property)", minutes: "About 7 minutes",
  sections: [
    ["1. When 1706 is used", "Form 1706 reports the capital gains tax on the sale, exchange or other onerous disposition of real property located in the Philippines that is held as a CAPITAL ASSET (not used in business and not held for sale in the ordinary course). The tax is 6% of the gross selling price or the fair market value, whichever is higher, and is paid whether the seller made a gain or a loss. If the property is an ordinary asset (used in business), the sale is part of income tax and the buyer withholds with Form 1606 instead. The return is filed within 30 days after the sale (Code Sec. 24(D); the 30 days is printed in the guidelines of the sister form 1707)."],
    ["2. The taxable base", "The seller compares (a) the gross selling price (or bid price in a foreclosure) with (b) the fair market value, which is itself the higher of the value on the tax declaration and the BIR zonal value. The higher of (a) and (b) is the taxable base. The tax is 6% of that base. The form has the buyer's and seller's identification, the property's location (RDO), and the ATC: WI 450 for an individual seller, WC 450 for a corporation."],
    ["3. The principal residence exemption", "An individual who sells his or her principal residence is exempt from the capital gains tax if the full proceeds are used to acquire or construct a new principal residence within 18 months (and notices the RDO within 30 days). If only part of the proceeds is utilized, the taxable base is the unutilized share: percentage of non-utilization = (selling price − amount utilized) ÷ selling price, multiplied by the higher of the selling price and FMV (Schedule 3, RR 13-99). The exemption can be used once every ten years."],
    ["4. Penalties", "A late 1706 carries a surcharge of 25% (50% if willful), interest of 12% a year counted by the day, and a compromise penalty. Penalties are computed on the tax payable (Item 16)."],
  ],
  worked: { intro: "A lot is sold for ₱3,000,000. TD value ₱1,500,000; zonal value ₱2,500,000.", steps: ["FMV = higher of the two = ₱2,500,000. Selling price ₱3,000,000 is higher, so the taxable base = ₱3,000,000.", "Tax due = 6% × ₱3,000,000 = ₱180,000."], title: "Form 1706", table: { "Sch.1 FMV": "2,500,000", "Sch.4 Item 2": "3,000,000", "12": "3,000,000", "14": "180,000", "18": "180,000" } },
  legal: ["NIRC Sec. 24(D) (capital gains from sale of real property, 6%), Sec. 24(D)(2) (principal residence), Sec. 56(A)(3)(b) and RR 13-99; BIR Form 1706 (January 2018 ENCS)."],
  guide: [
    ["1 to 4", "1", "Date of sale (MM/DD/YYYY), amended or not, ATC (WI 450 individual, WC 450 corporation), sheets attached.", "Deed of sale.", "ATC for the wrong seller type."],
    ["5 to 7", "5", "RDO of the property, seller and buyer names, addresses, ZIP and TINs.", "Deed, tax declaration.", "RDO of the seller instead of the property."],
    ["8 to 11", "8", "Principal residence? New residence within 18 months? More than one property? Tax relief?", "Facts of the sale.", "Yes to 9 without Schedule 3."],
    ["Sch. 1", "f1A", "FMV per tax declaration and per zonal value; the higher is computed.", "Tax declaration, BIR zonal values.", "Using the selling price."],
    ["Sch. 3", "utA", "Amount used for the new principal residence; the unutilized portion is computed.", "New residence contract.", "Counting the FMV."],
    ["Sch. 4", "s1AA", "Gross selling price; the taxable base is computed.", "Deed of sale.", "Using the gain."],
    ["12 to 18", "12", "Computed tax due at 6%; tax paid if amended; penalties from the filing date; compromise typed.", "Filing date.", "Applying 6% to the gain."],
  ],
  checklist: ["Confirm the property is a capital asset.", "Get the tax declaration and zonal value.", "Compute the taxable base.", "File within 30 days of the sale."],
  pitfalls: ["Using the gain as the base.", "Wrong ATC.", "Forgetting zonal value.", "Missing the 30 days."],
  amended: "Tick Yes in Item 2 and enter the tax paid in the original return in Item 15.",
  noPayment: "A fully exempt principal residence still needs the notice to the RDO within 30 days.",
  quiz: [
    ["The capital gains tax rate on real property is:", ["6%", "10%", "15%", "25%"], 0, "6% of the higher of selling price and FMV."],
    ["Selling price ₱1,000,000; FMV ₱1,600,000. Taxable base?", ["₱1,000,000", "₱1,600,000", "₱600,000", "₱2,600,000"], 1, "The higher of the two."],
    ["ATC for an individual seller:", ["WI 450", "WC 450", "II030", "IC110"], 0, "WI 450."],
    ["The return is filed within:", ["10 days", "30 days after the sale", "60 days", "1 year"], 1, "30 days after each sale."],
    ["For a principal residence, the taxable base is:", ["Always zero", "The unutilized share", "The gain", "The full price"], 1, "Only the portion not used for the new residence."],
  ],
});
