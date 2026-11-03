// BIR Form 2000, January 2018 (ENCS): Monthly Documentary Stamp Tax Declaration/Return.
// Item numbers follow docs/bir-forms/2000-DST-Jan-2018.pdf; the rates are the DST ATC table printed on it (DS 102, DS 106, DS 120, DS 121 are the four offered here).
// The 5th-day deadline is not printed on the PDF (rules/2026.ts flags it). Simplified: three lines in Schedule 1; Item 15A is not shown (Items 15B and 15C only).
import { RULES } from "../rules/2026";
import { f, fields, makeForm, opts, radio } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { caseOf, dayOfNextMonth, lessonOf, parseMonth } from "./kit";

/** Documentary stamp tax in centavos for a taxable base in centavos, by ATC (rates as printed on Forms 2000 and 2000-OT). */
export function dstTax(atc: string, baseCents: number): number {
  const b = Math.max(baseCents, 0);
  const units = (size: number) => Math.ceil(b / size);
  switch (atc) {
    case "DS102": case "DO102": case "DS106": return units(20_000) * 150; // P1.50 per P200 or fraction
    case "DS120": return b <= 0 ? 0 : 600 + Math.ceil(Math.max(b - 200_000, 0) / 100_000) * 200; // first P2,000: P6; P2 per P1,000 in excess
    case "DS121": return b <= 0 ? 0 : 4_000 + Math.ceil(Math.max(b - 500_000, 0) / 500_000) * 2_000; // first P5,000: P40; P20 per P5,000 in excess
    case "DO122": return units(100_000) * 1_500; // P15 per P1,000 or fraction
    default: return 0;
  }
}

const ATC = opts(["DS102", "DS 102 Sales, agreements to sell, transfer of shares with par value: P1.50 per P200"], ["DS106", "DS 106 Original issue of debt instruments (term of one year or more): P1.50 per P200 of issue price"], ["DS120", "DS 120 Leases and other hiring agreements: first P2,000 P6.00; P2.00 per P1,000 in excess"], ["DS121", "DS 121 Mortgages, pledges and deeds of trust: first P5,000 P40; P20 per P5,000 in excess"]);
const line = (n: 1 | 2 | 3) => [
  { id: `b${n}`, item: `Sch.1-${n} base`, label: `Line ${n}: Tax Base` },
  { id: `t${n}`, item: `Sch.1-${n} tax`, label: `Line ${n}: Tax Due (by the ATC's rate)`, f: (c: { n: (id: string) => number; text: (id: string) => string }) => dstTax(c.text(`d${n}`), c.n(`b${n}`)) },
];
function dueOf(v: Values): string { const p = parseMonth(v["1"]); return p ? dayOfNextMonth(p[1], p[0], RULES.dst.dueDay) : ""; }

export const DEF = makeForm({
  id: "2000", number: "2000", title: "Monthly Documentary Stamp Tax Declaration/Return", subtitle: "Documentary stamp tax on instruments signed, issued or accepted during the month",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 2000-DST Jan 2018 final. Rates are the ATC table printed on it; the 5th-day deadline comes from the Code and the user's table (not printed on the PDF).",
  yearId: "1",
  identity: [
    fields(f("1", "1", "For the Month (MM/YYYY)", "monthyear", { span: 4, required: true }), f("2", "2", "Amended Return?", "yesno", { span: 4, required: true }), f("3", "3", "Number of Sheet/s Attached", "count", { span: 4, required: true })),
    fields(f("4", "4", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("5", "5", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("6", "6", "Taxpayer's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("7", "7", "Registered Address", "text", { span: 9, required: true }), f("7A", "7A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("8", "8", "Contact Number", "phone", { span: 5 }), f("9", "9", "Email Address", "email", { span: 7 })),
    radio("13", "13", "Mode of Affixture", opts(["edst", "eDST System"], ["constructive", "Constructive Affixture"], ["loose", "Loose Stamps"])),
    radio("d1", "Sch.1-1", "Schedule 1 line 1: ATC", ATC),
    fields(f("d2", "Sch.1-2", "Schedule 1 line 2: ATC (optional)", "radio", { span: 12, options: ATC })),
    fields(f("d3", "Sch.1-3", "Schedule 1 line 3: ATC (optional)", "radio", { span: 12, options: ATC })),
  ],
  required: ["1", "2", "3", "4", "5", "6", "7", "7A", "13", "d1"].map((id) => ({ id, message: id === "3" ? "Enter the number of sheets attached (0 if none)." : id === "d1" ? "Choose the ATC of line 1 of Schedule 1." : `Item ${id} is required.` })),
  formats: { tin: ["4"], rdo: ["5"], zip: ["7A"], email: ["9"] },
  sections: [
    { id: "s1", title: "Schedule 1 – Summary of Computation of Taxes Due for the Month", lines: [...line(1), ...line(2), ...line(3)] },
    { id: "p2", title: "Part II – Computation of Payable", note: "Centavos are allowed on documentary stamp tax.", lines: [
      { id: "14", item: "14", label: "Tax Due for the Month (From Schedule 1)", f: (c) => c.n("t1") + c.n("t2") + c.n("t3"), bold: true, key: true },
      { id: "15B", item: "15B", label: "Payment thru Constructive Affixture (From Schedule 2)" },
      { id: "15C", item: "15C", label: "Advance Payment during the month (From Schedule 3)" },
      { id: "15D", item: "15D", label: "Total (Sum of Items 15A to 15C)", f: (c) => c.n("15B") + c.n("15C") },
      { id: "16", item: "16", label: "Net Tax Payable/(Overpayment) (Item 14 Less Item 15D)", f: (c) => c.n("14") - c.n("15D"), bold: true, key: true },
      { heading: "Add: Penalties" },
      { id: "17A", item: "17A", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "17B", item: "17B", label: "Interest", f: () => 0, indent: 1 },
      { id: "17C", item: "17C", label: "Compromise", indent: 1 },
      { id: "17D", item: "17D", label: "Total Penalties (Sum of Items 17A to 17C)", f: () => 0 },
      { id: "18", item: "18", label: "Total Amount Payable/(Overpayment) (Sum of Items 16 and 17D)", f: () => 0, bold: true, key: true },
    ] },
  ],
  split: 1,
  penalty: { base: "16", surcharge: "17A", interest: "17B", compromise: "17C", total: "17D", grand: "18", gross: () => 25_000_000_00 },
  due: dueOf,
  extraValidate: (v): Issue[] => {
    const out: Issue[] = [];
    for (const n of [2, 3]) if (Number(v[`b${n}A`]) > 0 && !v[`d${n}`]) out.push({ id: `d${n}`, item: `Sch.1-${n}`, message: `Choose the ATC of line ${n}.` });
    if (v["2"] === "yes") out.push({ id: "2", item: "2", message: "An amended DST return needs the tax paid in the earlier return: this lab files the original return only." });
    return out;
  },
  scoreExtra: [{ id: "d1", weight: 3 }, { id: "d2", weight: 3 }, { id: "d3", weight: 3 }],
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string): Values => ({ "4": `000-${n}-123-00000`, "5": rdo, "6": name, "7": addr, "7A": zip, "8": `0917000${n}`, "9": `dst${n}@example.com` });
const common = { "2": "no", "3": "1", "13": "edst" } as const;

export const CASES = [
  caseOf({
    form: "2000", level: "easy", year: 2025, title: "A bank issues a loan",
    story: ["Nueva Ecija Rural Bank, Inc. (Cabanatuan City 3100) released one loan in January 2025: a promissory note with an issue price of ₱1,000,000 and a term of 3 years (an original issue of a debt instrument, DS 106). It affixes through the eDST system.", "It files and pays on February 4, 2025. Fill in BIR Form 2000 for 01/2025."],
    profile: P(221, "025", "NUEVA ECIJA RURAL BANK, INC.", "POBLACION, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "1": "01/2025", d1: "DS106", b1A: "1000000" },
    filing: "2025-02-04", klass: "small",
    why: "The documentary stamp tax on instruments issued in a month is declared with Form 2000.",
    hints: ["DS 106: P1.50 for each P200 or fraction of the issue price.", "₱1,000,000 ÷ ₱200 = 5,000 units.", "Payments through eDST are not a credit in this lab: Item 15 is empty."],
    solution: ["Tax due (Schedule 1 line 1) = (₱1,000,000 ÷ ₱200) × ₱1.50 = 5,000 × ₱1.50 = ₱7,500 = Item 14. No advance payment: Item 16 = ₱7,500. On time (due February 5): Item 18 = ₱7,500."],
  }),
  caseOf({
    form: "2000", level: "average", year: 2025, title: "A lease and a mortgage, with an advance payment",
    story: ["San Jose Lending & Realty Corp. (San Jose City 3121) signed in March 2025: a lease contract with a total rent of ₱500,000 (DS 120) and a real estate mortgage securing ₱3,000,000 (DS 121). It had paid ₱2,000 in advance during the month (Item 15C).", "It files on April 3, 2025. Fill in BIR Form 2000 for 03/2025."],
    profile: P(222, "026", "SAN JOSE LENDING & REALTY CORP.", "BRGY. SAN AGUSTIN, SAN JOSE CITY, NUEVA ECIJA", "3121"),
    facts: { ...common, "1": "03/2025", "3": "2", d1: "DS120", b1A: "500000", d2: "DS121", b2A: "3000000", "15CA": "2000" },
    filing: "2025-04-03", klass: "small",
    why: "The documentary stamp tax on instruments signed in a month is declared with Form 2000.",
    hints: ["Lease: first ₱2,000 is ₱6; then ₱2 for each ₱1,000 or fraction in excess.", "Mortgage: first ₱5,000 is ₱40; then ₱20 for each ₱5,000 or fraction in excess.", "Subtract the advance payment."],
    solution: ["Lease: ₱6 + ₱2 × ⌈(₱500,000 − ₱2,000) ÷ ₱1,000⌉ = ₱6 + ₱2 × 498 = ₱1,002.", "Mortgage: ₱40 + ₱20 × ⌈(₱3,000,000 − ₱5,000) ÷ ₱5,000⌉ = ₱40 + ₱20 × 599 = ₱12,020. Tax due for the month (Item 14) = ₱13,022.", "Less advance payment ₱2,000: net payable (Item 16) = ₱11,022. On time: Item 18 = ₱11,022."],
  }),
  caseOf({
    form: "2000", level: "difficult", year: 2025, title: "Three instruments, constructive affixture, filed late",
    story: ["Gapan Credit & Finance Corp. (Gapan City 3105), a small taxpayer, in June 2025: transfer of shares with par value ₱1,000,000 (DS 102), an original issue of debt instruments of ₱2,500,000 (DS 106), and a mortgage of ₱800,000 (DS 121). It paid ₱10,000 through constructive affixture (Item 15B).",
      "The return was due July 5, 2025. It files and pays on July 25, 2025, 20 days late. As a small taxpayer the surcharge is 10% and interest 6% a year by the day over 365; compromise ₱500. Fill in BIR Form 2000 for 06/2025."],
    profile: P(223, "027", "GAPAN CREDIT & FINANCE CORP.", "BRGY. SAN VICENTE, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "1": "06/2025", "3": "3", "13": "constructive", d1: "DS102", b1A: "1000000", d2: "DS106", b2A: "2500000", d3: "DS121", b3A: "800000", "15BA": "10000", "17CA": "500" },
    filing: "2025-07-25", klass: "small",
    why: "The documentary stamp tax on instruments signed in a month is declared with Form 2000, even when late.",
    hints: ["Each ATC has its own rate; compute each line.", "Constructive affixture is a payment already made (Item 15B).", "July 5 to July 25 is 20 days."],
    solution: ["Line 1: (₱1,000,000 ÷ ₱200) × ₱1.50 = ₱7,500. Line 2: (₱2,500,000 ÷ ₱200) × ₱1.50 = 12,500 × ₱1.50 = ₱18,750. Line 3: ₱40 + ₱20 × ⌈(₱800,000 − ₱5,000) ÷ ₱5,000⌉ = ₱40 + ₱20 × 159 = ₱3,220. Item 14 = ₱29,470.", "Less ₱10,000: net payable (Item 16) = ₱19,470.", "Surcharge = 10% × ₱19,470 = ₱1,947; interest = ₱19,470 × 6% × 20 ÷ 365 = ₱64.01 → ₱64; compromise ₱500; total penalties ₱2,511. Item 18 = ₱21,981."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 2000: Monthly Documentary Stamp Tax Declaration/Return", minutes: "About 6 minutes",
  sections: [
    ["1. What DST is", "The documentary stamp tax (DST) is a tax on the privilege of making, signing, issuing or accepting certain documents: loan agreements and debt instruments, leases, mortgages, share certificates and transfers, insurance policies and others. The taxpayer declares the DST due for each month on Form 2000 (use Form 2000-OT for one-time transactions such as the sale of real property or shares). The DST may be paid by eDST, by constructive affixture, or with loose stamps; the form records the mode. The deadline is taught as the fifth (5th) day after the end of the month (the Code and the user's table; the PDF does not print it)."],
    ["2. The rates (from the form's ATC table)", "DS 101 original issue of shares: ₱2.00 per ₱200 of par value. DS 102 sale or transfer of shares with par value: ₱1.50 per ₱200. DS 106 original issue of debt instruments of one year or more: ₱1.50 per ₱200 of the issue price. DS 120 leases: the first ₱2,000 is ₱6.00 and ₱2.00 for each ₱1,000 or fraction in excess. DS 121 mortgages: the first ₱5,000 is ₱40 and ₱20 for each ₱5,000 or fraction in excess. Many other documents have flat amounts. 'Each ₱200 or fraction' means you round the number of units UP.", "Schedule 1 lists each ATC with the tax base and the tax due; Item 14 totals them. Payments through constructive affixture (Schedule 2) and advance payments (Schedule 3) reduce the amount payable (Item 16). A late return adds a surcharge, interest and compromise on Item 16 (25% and 12% in general; 10% and 6% for micro and small taxpayers)."],
  ],
  worked: { intro: "A loan with an issue price of ₱600,000 (term over one year).", steps: ["₱600,000 ÷ ₱200 = 3,000 units × ₱1.50 = ₱4,500."], title: "Form 2000", table: { "Sch.1 base": "600,000", "Sch.1 tax": "4,500", "14": "4,500", "16": "4,500" } },
  legal: ["NIRC Title VII (Secs. 173 to 201): documentary stamp taxes; Sec. 200 (payment and returns); BIR Forms 2000 and 2000-OT (January 2018 ENCS), DST/ATC table."],
  guide: [
    ["1 to 3", "1", "The month (MM/YYYY), amended, sheets.", "Your documents.", "Mixing months."],
    ["4 to 9, 13", "4", "TIN, RDO, name, address, contact, email, mode of affixture.", "COR.", "Wrong mode."],
    ["Sch. 1", "b1A", "ATC per document and the tax base; the tax due is computed.", "The documents.", "Not rounding units up."],
    ["14 to 16", "15BA", "Computed tax due; constructive affixture; advance payment; net payable.", "Receipts.", "Counting payments twice."],
    ["17 and 18", "17CA", "Penalties from the filing date; compromise typed.", "Filing date.", "Applying penalties to on-time returns."],
  ],
  checklist: ["List every taxable document of the month.", "Find its ATC and the base.", "Round the units up.", "File by the 5th of the next month."],
  pitfalls: ["Rounding down the units.", "Wrong ATC.", "Using 2000 for one-time sales (use 2000-OT)."],
  amended: "This lab files the original return only.",
  noPayment: "If no document was made in the month, no return is needed.",
  quiz: [
    ["DS 106 is taxed at:", ["₱1.50 per ₱200", "₱15 per ₱1,000", "₱2 per ₱200", "₱6 flat"], 0, "P1.50 per P200 of the issue price."],
    ["A fraction of ₱200 counts as:", ["Zero", "A full unit", "Half a unit", "Two units"], 1, "Round up."],
    ["Lease tax on ₱2,000 total rent:", ["₱6", "₱2", "₱12", "₱0"], 0, "The first ₱2,000 is ₱6."],
    ["Form 2000 is for:", ["One-time transactions", "Monthly DST declaration", "Annual income", "VAT"], 1, "The monthly DST return."],
    ["Mortgage of ₱5,000: the DST is:", ["₱40", "₱20", "₱60", "₱100"], 0, "The first ₱5,000 is ₱40."],
  ],
});
