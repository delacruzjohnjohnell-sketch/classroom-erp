// BIR Form 1707, April 2021 (ENCS): Capital Gains Tax Return for onerous transfer of shares of stock not traded through the local stock exchange.
// Item numbers follow docs/bir-forms/1707-Apr-2021.pdf and its Guidelines. Simplified: cash/foreclosure sale only (the installment method, Schedule 1, is not simulated);
// two stock lines in Schedule 2 and two lines of cost in Schedule 3.
import { RULES } from "../rules/2026";
import { addDays, caseOf, lessonOf } from "./kit";
import { isIso, roundToPeso, usToIso } from "../engine/tax";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";

const dueOf = (v: Values) => { const d = usToIso(v["1"]); return isIso(d) ? addDays(d, RULES.capitalGains.dueDays) : ""; };

export const DEF = makeForm({
  id: "1707", number: "1707", title: "Capital Gains Tax Return", subtitle: "For Onerous Transfer of Shares of Stock Not Traded Through the Local Stock Exchange",
  version: "April 2021 (ENCS)", versionNote: "Official PDF: 1707 April 2021 ENCS and its Guidelines. 15% printed on the form; filed and paid within thirty (30) days after each sale (Guidelines).",
  identity: [
    fields(f("1", "1", "Date of Transaction (MM/DD/YYYY)", "date", { span: 4, required: true }), yes("2", "2", "Amended Return?", 3), f("3", "3", "ATC", "radio", { span: 3, options: opts(["II030", "II030 Individual"], ["IC110", "IC110 Corporation"]), required: true }), f("4", "4", "Number of Sheet/s Attached", "count", { span: 2, required: true })),
    fields(f("5", "5", "RDO Code of the Seller", "rdo", { span: 4, required: true })),
    fields(f("6", "6", "Seller's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("6A", "6A", "Seller's Registered Address", "text", { span: 7, required: true }), f("6B", "6B", "ZIP Code", "zip", { span: 2, required: true }), f("6C", "6C", "Seller's TIN", "tin", { span: 3, required: true })),
    fields(f("7", "7", "Buyer's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("7A", "7A", "Buyer's Registered Address", "text", { span: 7, required: true }), f("7B", "7B", "ZIP Code", "zip", { span: 2, required: true }), f("7C", "7C", "Buyer's TIN", "tin", { span: 3, required: true })),
    fields(yes("8", "8", "Are you availing of tax relief under Special Law or International Tax Treaty?", 6)),
    radio("9", "9", "Description of Transaction", opts(["cash", "Cash Sale"], ["foreclosure", "Foreclosure Sale"], ["installment", "Installment Sale (not simulated here)"], ["others", "Others"])),
  ],
  required: ["1", "2", "3", "4", "5", "6", "6A", "6B", "6C", "7", "7A", "7B", "7C", "8", "9"].map((id) => ({ id, message: id === "4" ? "Enter the number of sheets attached (0 if none)." : `Item ${id} is required.` })),
  formats: { tin: ["6C", "7C"], rdo: ["5"], zip: ["6B", "7B"] },
  sections: [
    { id: "s2", title: "Part IV – Schedule 2: Description of Shares of Stocks (Taxable Base / Selling Price)", lines: [
      { id: "a1", item: "Sch.2-A", label: "Stock A: Taxable Base / Selling Price" },
      { id: "a2", item: "Sch.2-B", label: "Stock B: Taxable Base / Selling Price" },
      { id: "a3", item: "Sch.2-Total", label: "Total Taxable Base (To Part II Item 10)", f: (c) => c.n("a1") + c.n("a2"), bold: true },
    ] },
    { id: "s3", title: "Part IV – Schedule 3: Cost and Other Allowable Expenses", lines: [
      { id: "c1", item: "Sch.3-A", label: "Cost of shares" },
      { id: "c2", item: "Sch.3-B", label: "Other allowable expenses (documentary stamp tax, notarial fees)" },
      { id: "c3", item: "Sch.3-Total", label: "Total (To Part II Item 11)", f: (c) => c.n("c1") + c.n("c2"), bold: true },
    ] },
    { id: "p2", title: "Part II – Computation of Tax", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", cols: ["A"], lines: [
      { id: "10", item: "10", label: "Taxable Base - for Cash Sale / Foreclosure Sale (From Part IV - Schedule 2)", f: (c) => c.n("a3") },
      { id: "11", item: "11", label: "Less: Cost and Other Allowable Expenses (From Part IV - Schedule 3)", f: (c) => c.n("c3") },
      { id: "12", item: "12", label: "Net Capital Gain/(Loss) (Item 10 Less Item 11)", f: (c) => c.n("10") - c.n("11"), bold: true, key: true },
      { id: "14", item: "14", label: "Tax Due on the Entire Transaction (Item 12 x 15%, Item 13)", f: (c) => (c.n("12") > 0 ? roundToPeso(Math.round(c.n("12") * RULES.capitalGains.shareRate)) : 0), bold: true, key: true },
      { id: "16", item: "16", label: "Less: Tax Paid in Return Previously Filed, if this is an Amended Return" },
      { id: "17", item: "17", label: "Tax Payable/(Overpayment) (Item 14 Less Item 16)", f: (c) => c.n("14") - c.n("16"), bold: true },
      { heading: "Add: Penalties" },
      { id: "18A", item: "18A", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "18B", item: "18B", label: "Interest", f: () => 0, indent: 1 },
      { id: "18C", item: "18C", label: "Compromise", indent: 1 },
      { id: "18D", item: "18D", label: "Total Penalties (Sum of Items 18A to 18C)", f: () => 0 },
      { id: "19", item: "19", label: "Total Amount Payable/(Overpayment) (Sum of Items 17 and 18D)", f: () => 0, bold: true, key: true },
    ] },
  ],
  split: 1,
  penalty: { base: "17", surcharge: "18A", interest: "18B", compromise: "18C", total: "18D", grand: "19", cols: ["A"], gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    if (v["9"] === "installment") out.push({ id: "9", item: "9", message: "The installment method (Schedule 1) is not simulated in this lab; use a cash or foreclosure sale." });
    if (v["2"] === "yes" && !(Number(v["16A"]) > 0)) out.push({ id: "16A", item: "16", message: "This is an amended return: enter the tax paid in the return previously filed (Item 16)." });
    if (v["3"] === "II030" && /\b(INC|CORP|CORPORATION)\b/i.test(v["6"] ?? "")) out.push({ id: "3", item: "3", message: "The seller looks like a corporation: ATC IC110." });
    return out;
  },
  scoreExtra: [{ id: "3", weight: 2 }],
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string, buyer: string): Values => ({ "5": rdo, "6": name, "6A": addr, "6B": zip, "6C": `000-000-${n}-00000`, "7": buyer, "7A": "POBLACION, SAN JOSE CITY, NUEVA ECIJA", "7B": "3121", "7C": "000-888-999-00000" });
const common = { "2": "no", "3": "II030", "4": "1", "8": "no", "9": "cash" } as const;

export const CASES = [
  caseOf({
    form: "1707", level: "easy", year: 2025, title: "Selling shares of a family corporation at a gain",
    story: ["Teresita B. Manalo (Barangay Aduas Sur, Cabanatuan City 3100) sold 1,000 shares of Manalo Agri Ventures, Inc. (a domestic corporation not listed on the stock exchange) to Jesus P. Santos on July 15, 2025 for ₱1,500,000 in cash. The shares cost her ₱1,000,000; she paid ₱20,000 in legal and notarial fees for the sale.", "She files and pays on August 11, 2025 (within 30 days). Fill in BIR Form 1707."],
    profile: P(141, "025", "MANALO, TERESITA, BAUTISTA", "BRGY. ADUAS SUR, CABANATUAN CITY, NUEVA ECIJA", "3100", "SANTOS, JESUS, PADILLA"),
    facts: { ...common, "1": "07/15/2025", a1A: "1500000", c1A: "1000000", c2A: "20000" },
    filing: "2025-08-11", klass: "large",
    why: "The sale of unlisted shares is reported with Form 1707 (capital gains tax on shares not traded through the stock exchange).",
    hints: ["The tax is on the NET capital gain: selling price less cost and allowable expenses.", "The rate is 15%.", "ATC II030 is for an individual seller."],
    solution: ["Taxable base (Item 10) = ₱1,500,000. Cost and expenses (Item 11) = ₱1,000,000 + ₱20,000 = ₱1,020,000. Net capital gain (Item 12) = ₱480,000.", "Tax due (Item 14) = 15% × ₱480,000 = ₱72,000. Filed on day 27: Item 19 = ₱72,000."],
  }),
  caseOf({
    form: "1707", level: "average", year: 2025, title: "A sale at a loss",
    story: ["Narciso E. Garcia (Barangay Zulueta, Cabanatuan City 3100) sold unlisted shares of Zulueta Rice Mills, Inc. to Pedro L. Dizon on September 2, 2025 for ₱800,000 cash. He bought them for ₱950,000 and paid ₱10,000 in fees on the sale.", "He files on September 20, 2025. There is a net capital loss. Fill in BIR Form 1707."],
    profile: P(142, "025", "GARCIA, NARCISO, ESPIRITU", "BRGY. ZULUETA, CABANATUAN CITY, NUEVA ECIJA", "3100", "DIZON, PEDRO, LAZARO"),
    facts: { ...common, "1": "09/02/2025", a1A: "800000", c1A: "950000", c2A: "10000" },
    filing: "2025-09-20", klass: "large",
    why: "Even a sale at a loss is reported with Form 1707, with no tax due.",
    hints: ["Net capital gain = price less cost and expenses; here it is negative.", "The tax due on a loss is zero.", "Item 12 is shown as a loss."],
    solution: ["Taxable base ₱800,000. Cost and expenses = ₱950,000 + ₱10,000 = ₱960,000. Net capital gain/(loss) (Item 12) = (₱160,000).", "Tax due (Item 14) = ₱0 (no tax on a loss). Item 19 = ₱0."],
  }),
  caseOf({
    form: "1707", level: "difficult", year: 2025, title: "Two stocks sold at once, filed late",
    story: ["Evelyn M. Rosales (Barangay Cabu, Gapan City 3105) sold two blocks of unlisted shares to Gapan Holdings Corp. on August 20, 2025: Stock A (Rosales Trading, Inc.) for ₱2,400,000 and Stock B (Rosales Storage Corp.) for ₱1,600,000, both in cash. Cost: Stock A ₱1,500,000; Stock B ₱1,100,000. Other allowable expenses ₱40,000.",
      "The 30-day period ended September 19. She files and pays on October 24, 2025, 35 days late. The regular late rates apply: 25% surcharge, 12% interest a year by the day over 365, and a compromise penalty of ₱5,000. Three attachments. Fill in BIR Form 1707."],
    profile: P(143, "027", "ROSALES, EVELYN, MANGUBAT", "BRGY. CABU, GAPAN CITY, NUEVA ECIJA", "3105", "GAPAN HOLDINGS CORP."),
    facts: { ...common, "1": "08/20/2025", "4": "3", a1A: "2400000", a2A: "1600000", c1A: "2600000", c2A: "40000", "18CA": "5000" },
    filing: "2025-10-24", klass: "large",
    why: "A sale of unlisted shares is reported with Form 1707, whether one or several stocks are sold.",
    hints: ["Add the selling prices of both stocks for Item 10.", "Cost of shares = ₱1,500,000 + ₱1,100,000.", "September 19 to October 24 is 35 days; penalties are on Item 17."],
    solution: ["Taxable base (Item 10) = ₱2,400,000 + ₱1,600,000 = ₱4,000,000. Cost and expenses (Item 11) = ₱2,600,000 + ₱40,000 = ₱2,640,000. Net gain (Item 12) = ₱1,360,000.", "Tax due (Item 14) = 15% × ₱1,360,000 = ₱204,000.", "Surcharge = 25% × ₱204,000 = ₱51,000. Interest = ₱204,000 × 12% × 35 ÷ 365 = ₱2,347.40 → ₱2,347. Compromise ₱5,000. Total penalties ₱58,347. Item 19 = ₱262,347."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1707: Capital Gains Tax Return (shares not traded through the stock exchange)", minutes: "About 6 minutes",
  sections: [
    ["1. When 1707 is used", "Form 1707 reports the capital gains tax on the sale, barter, exchange or other onerous disposition of shares of stock in a DOMESTIC corporation, held as capital assets, that are NOT traded through the local stock exchange (shares sold through the exchange pay a percentage tax on the gross selling price instead). The tax is 15% of the net capital gain, for individuals and corporations, resident or not. The buyer withholds the tax from the price. The return is filed and paid within thirty (30) days after each sale (per the form's Guidelines); for an installment sale, within 30 days after the first down payment and each installment."],
    ["2. Computing the tax", "The taxable base (Item 10) is the selling price per Schedule 2, one line per stock sold. Cost and other allowable expenses (Item 11) come from Schedule 3: what the seller paid for the shares plus expenses of the sale (for example documentary stamp tax and notarial fees). Net capital gain or loss = Item 10 − Item 11. The tax due is 15% of the gain; there is no tax on a loss, and the loss is not carried over. The ATC is II030 for an individual seller and IC110 for a corporation."],
    ["3. Penalties", "A late 1707 carries a 25% surcharge (50% if willful), interest and a compromise penalty. Interest is 12% a year counted by the day (the lab counts days over 365). Penalties are computed on the tax payable (Item 17)."],
  ],
  worked: { intro: "Unlisted shares sold for ₱1,000,000 that cost ₱700,000; expenses ₱20,000.", steps: ["Net gain = ₱1,000,000 − ₱720,000 = ₱280,000.", "Tax = 15% × ₱280,000 = ₱42,000."], title: "Form 1707", table: { "10": "1,000,000", "11": "720,000", "12": "280,000", "14": "42,000", "19": "42,000" } },
  legal: ["NIRC Sec. 24(C) (individuals) and Sec. 27(D)(2) (corporations): 15% on net capital gains from sale of shares not traded through the stock exchange; Sec. 56(A)(3)(c); BIR Form 1707 (April 2021 ENCS) and its Guidelines."],
  guide: [
    ["1 to 4", "1", "Date of sale, amended or not, ATC (II030 individual, IC110 corporation), sheets attached.", "Deed of sale.", "Wrong ATC."],
    ["5 to 7", "5", "Seller's RDO, names, addresses, ZIP and TINs.", "COR, deed.", "Buyer and seller mixed."],
    ["8 and 9", "8", "Tax relief answer and the description of the transaction.", "Deed.", "Choosing installment without Schedule 1."],
    ["Sch. 2", "a1A", "Selling price per stock; total is computed.", "Deed.", "Net of cost."],
    ["Sch. 3", "c1A", "Cost of shares and other allowable expenses; total is computed.", "Purchase records.", "Forgetting expenses."],
    ["10 to 14", "10", "Computed taxable base, cost, net gain; computed tax at 15%.", "Computed.", "Taxing the price instead of the gain."],
    ["16 to 19", "16", "Tax paid if amended; penalties from the filing date; compromise typed.", "Filing date.", "Interest on the wrong base."],
  ],
  checklist: ["Confirm the shares are not listed.", "Get the cost records.", "Total the sale price per stock.", "File within 30 days of the sale."],
  pitfalls: ["Taxing the gross price.", "No tax on a loss, but still a return.", "Wrong ATC.", "Late filing."],
  amended: "Tick Yes in Item 2 and enter the tax paid in the original return in Item 16.",
  noPayment: "A sale at a loss is still reported; the tax due is zero.",
  quiz: [
    ["The tax on net capital gain from unlisted shares is:", ["6%", "10%", "15%", "25%"], 2, "15% of net capital gain."],
    ["Price ₱500,000, cost ₱300,000, expenses ₱20,000. Net gain?", ["₱200,000", "₱180,000", "₱220,000", "₱500,000"], 1, "₱500,000 − ₱320,000."],
    ["ATC of a corporate seller:", ["II030", "IC110", "WI 450", "WC 450"], 1, "IC110."],
    ["The return is filed:", ["Within 30 days after each sale", "By April 15", "Quarterly", "Annually"], 0, "Within thirty days after each sale."],
    ["A net capital loss gives a tax due of:", ["Negative", "Zero", "15% of the loss", "5%"], 1, "No tax on a loss."],
  ],
});
