// BIR Form 2551Q, January 2018 (ENCS): Quarterly Percentage Tax Return.
// Item numbers follow docs/bir-forms/2551Q-Jan-2018.pdf; rates are the ATC table printed on it. Simplified to two lines of Schedule 1.
import { RULES } from "../rules/2026";
import { roundToPeso, type Classification } from "../engine/tax";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Issue, Values } from "../forms/types";
import { addDays, caseOf, lessonOf, quarterEnd } from "./kit";

const ATC = opts(...Object.entries(RULES.percentageTax.labels).map(([k, l]) => [k, l] as [string, string]));
const KLASS: Record<string, Classification> = { micro: "micro", small: "small", medium: "medium", large: "large" };
const dueOf = (v: Values) => { const end = quarterEnd(v["2"], Number(v["3"])); return end ? addDays(end, RULES.percentageTax.dueDays) : ""; };
const rateOf = (atc: string) => RULES.percentageTax.rates[atc] ?? 0;

export const DEF = makeForm({
  id: "2551Q", number: "2551Q", title: "Quarterly Percentage Tax Return", subtitle: "Persons subject to percentage tax (non-VAT)",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 2551Q Jan 2018 ENCS final rev 3. The PDF prints the ATC rates; the 25-day deadline comes from the Code (Sec. 128), not the PDF.",
  yearId: "2",
  identity: [
    fields(f("1", "1", "For the", "radio", { span: 4, options: opts(["calendar", "Calendar"], ["fiscal", "Fiscal"]), required: true }), f("2", "2", "Year Ended (MM/YYYY)", "monthyear", { span: 3, required: true }), f("3", "3", "Quarter", "radio", { span: 3, options: opts(["1", "1st"], ["2", "2nd"], ["3", "3rd"], ["4", "4th"]), required: true })),
    fields(yes("4", "4", "Amended Return?", 4), f("5", "5", "Number of Sheet/s Attached", "count", { span: 3, required: true })),
    fields(f("6", "6", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("7", "7", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("8", "8", "Taxpayer's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("9", "9", "Registered Address", "text", { span: 9, required: true }), f("9A", "9A", "ZIP Code", "zip", { span: 3, required: true })),
    fields(f("10", "10", "Contact Number", "phone", { span: 5 }), f("11", "11", "Email Address", "email", { span: 7 })),
    fields(yes("12", "12", "Are you availing of tax relief under Special Law or International Tax Treaty?", 6), yes("13", "13", "Individual: elected the 8% income tax rate on gross sales/receipts (in lieu of the percentage tax)?", 6)),
    fields(f("k", "Class", "Taxpayer classification (for the penalty rates)", "radio", { span: 12, options: opts(["micro", "Micro"], ["small", "Small"], ["medium", "Medium"], ["large", "Large"]) })),
    radio("a1", "Sch.1-1", "Schedule 1, line 1: ATC", ATC),
    fields(f("a2", "Sch.1-2", "Schedule 1, line 2: ATC (optional)", "radio", { span: 12, options: ATC })),
  ],
  required: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "9A", "12", "13", "a1"].map((id) => ({ id, message: id === "5" ? "Enter the number of sheets attached (0 if none)." : id === "a1" ? "Choose the ATC of the first line of Schedule 1." : `Item ${id} is required.` })),
  formats: { tin: ["6"], rdo: ["7"], zip: ["9A"], email: ["11"] },
  sections: [
    { id: "s1", title: "Schedule 1 – Computation of Tax", note: "Taxable amount x the rate of the ATC.", lines: [
      { id: "m1", item: "Sch.1-1 amount", label: "Line 1: Taxable Amount" },
      { id: "x1", item: "Sch.1-1 tax", label: "Line 1: Tax Due (Taxable Amount x Tax Rate of the ATC)", f: (c) => roundToPeso(Math.round(c.n("m1") * rateOf(c.text("a1")))) },
      { id: "m2", item: "Sch.1-2 amount", label: "Line 2: Taxable Amount" },
      { id: "x2", item: "Sch.1-2 tax", label: "Line 2: Tax Due (Taxable Amount x Tax Rate of the ATC)", f: (c) => roundToPeso(Math.round(c.n("m2") * rateOf(c.text("a2")))) },
      { id: "7", item: "Sch.1-7", label: "Total Tax Due (Sum of Items 1 to 6) (To Part II Item 14)", f: (c) => c.n("x1") + c.n("x2"), bold: true, key: true },
    ] },
    { id: "p2", title: "Part II – Total Tax Payable", note: "DO NOT enter Centavos; 49 Centavos or Less drop down; 50 or more round up", lines: [
      { id: "14", item: "14", label: "Total Tax Due (From Schedule 1 Item 7)", f: (c) => c.n("7"), key: true },
      { id: "15", item: "15", label: "Creditable Percentage Tax Withheld per BIR Form No. 2307" },
      { id: "16", item: "16", label: "Tax Paid in Return Previously Filed, if this is an Amended Return" },
      { id: "17", item: "17", label: "Other Tax Credit/Payment (specify)", specify: true },
      { id: "18", item: "18", label: "Total Tax Credits/Payments (Sum of Items 15 to 17)", f: (c) => c.n("15") + c.n("16") + c.n("17") },
      { id: "19", item: "19", label: "Tax Still Payable/(Overpayment) (Item 14 Less Item 18)", f: (c) => c.n("14") - c.n("18"), bold: true, key: true },
      { heading: "Add: Penalties" },
      { id: "20", item: "20", label: "Surcharge", f: () => 0, indent: 1 },
      { id: "21", item: "21", label: "Interest", f: () => 0, indent: 1 },
      { id: "22", item: "22", label: "Compromise", indent: 1 },
      { id: "23", item: "23", label: "Total Penalties (Sum of Items 20 to 22)", f: () => 0 },
      { id: "24", item: "24", label: "TOTAL AMOUNT PAYABLE/(Overpayment) (Sum of Items 19 and 23)", f: () => 0, bold: true, key: true },
    ] },
  ],
  penalty: { base: "19", surcharge: "20", interest: "21", compromise: "22", total: "23", grand: "24", klass: (v) => KLASS[v["k"]], gross: () => 1_000_000_00 },
  due: dueOf,
  extraValidate: (v, _ctx, computed): Issue[] => {
    const out: Issue[] = [];
    if (v["13"] === "yes" && Number(computed["7A"] ?? 0) > 0) out.push({ id: "13", item: "13", message: "An individual who elected the 8% income tax rate is not subject to the percentage tax: no percentage tax return (and no tax due) for that income." });
    if (v["4"] === "yes" && !(Number(v["16A"]) > 0)) out.push({ id: "16A", item: "16", message: "This is an amended return: enter the tax paid in the return previously filed (Item 16)." });
    if (Number(v["m2A"]) > 0 && !v["a2"]) out.push({ id: "a2", item: "Sch.1-2", message: "Choose the ATC of line 2 of Schedule 1." });
    return out;
  },
  scoreExtra: [{ id: "a1", weight: 2 }, { id: "a2", weight: 2 }],
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string): Values => ({ "6": `000-${n}-444-00000`, "7": rdo, "8": name, "9": addr, "9A": zip, "10": `0917000${n}`, "11": `pt${n}@example.com` });
const common = { "1": "calendar", "2": "12/2025", "4": "no", "5": "1", "12": "no", "13": "no", k: "micro" } as const;

export const CASES = [
  caseOf({
    form: "2551Q", level: "easy", year: 2025, title: "A small trader exempt from VAT",
    story: ["Dolores F. Magat (Barangay Maligaya, Talavera, Nueva Ecija 3114) runs a store with gross receipts below ₱3 million. She is non-VAT registered and did NOT elect the 8% income tax rate, so she pays the 3% percentage tax (ATC PT 010).", "January to March 2025: gross receipts ₱500,000; a customer gave her a 2307 for ₱4,000 of percentage tax withheld. She files on April 24, 2025. Fill in BIR Form 2551Q for the first quarter of 2025."],
    profile: P(171, "027", "MAGAT, DOLORES, FLORES", "BRGY. MALIGAYA, TALAVERA, NUEVA ECIJA", "3114"),
    facts: { ...common, "3": "1", a1: "PT010", m1A: "500000", "15A": "4000" },
    filing: "2025-04-24", klass: "micro",
    why: "A non-VAT taxpayer subject to percentage tax files the quarterly percentage tax return, Form 2551Q.",
    hints: ["PT 010 is the 3% percentage tax for persons exempt from VAT.", "The tax due is the gross receipts times the rate.", "The 2307 for percentage tax goes to Item 15."],
    solution: ["Tax due (Schedule 1 Item 7 = Item 14) = 3% × ₱500,000 = ₱15,000.", "Credits (Item 18) = ₱4,000. Tax still payable (Item 19) = ₱11,000. Filed on time (due April 25): Item 24 = ₱11,000."],
  }),
  caseOf({
    form: "2551Q", level: "average", year: 2025, title: "An insurance agent with other receipts",
    story: ["Ramiro G. Soriano (Barangay Dicarma, Cabanatuan City 3100) is a non-VAT insurance agent who also sells goods. April to June 2025: gross receipts from his store ₱700,000 (PT 010, 3%) and insurance commissions ₱200,000 (PT 130, 4%). A 2307 shows ₱3,000 withheld. He files on July 24, 2025 with one attachment.", "Fill in BIR Form 2551Q for the second quarter of 2025, using both lines of Schedule 1."],
    profile: P(172, "025", "SORIANO, RAMIRO, GALANG", "BRGY. DICARMA, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "3": "2", a1: "PT010", m1A: "700000", a2: "PT130", m2A: "200000", "15A": "3000" },
    filing: "2025-07-24", klass: "micro",
    why: "A non-VAT taxpayer with percentage tax on more than one kind of receipt files Form 2551Q with one line per ATC.",
    hints: ["Each kind of receipt has its own ATC and rate.", "Insurance agents pay 4% (PT 130).", "Total the two lines for Item 7."],
    solution: ["Line 1: 3% × ₱700,000 = ₱21,000. Line 2: 4% × ₱200,000 = ₱8,000. Total tax due (Item 7 = Item 14) = ₱29,000.", "Credits ₱3,000; tax still payable (Item 19) = ₱26,000. On time (due July 25): Item 24 = ₱26,000."],
  }),
  caseOf({
    form: "2551Q", level: "difficult", year: 2025, title: "A karaoke bar, filed late",
    story: ["Tony's Videoke Bar (San Jose City 3121) is an amusement place owned by Antonio B. Vergara, non-VAT, a micro taxpayer. July to September 2025: gross receipts from the videoke bar ₱450,000 (PT 150, 18%) and from a small canteen ₱300,000 (PT 010, 3%). A 2307 shows ₱5,000 withheld.", "The return was due October 25, 2025; he files and pays on November 14, 2025 (20 days late). As a micro taxpayer the surcharge is 10% and interest 6% a year, by the day over 365; the compromise assessed is ₱1,500. Fill in BIR Form 2551Q for the third quarter of 2025."],
    profile: P(173, "026", "VERGARA, ANTONIO, BELTRAN", "BRGY. SAN ROQUE, SAN JOSE CITY, NUEVA ECIJA", "3121"),
    facts: { ...common, "3": "3", a1: "PT150", m1A: "450000", a2: "PT010", m2A: "300000", "15A": "5000", "22A": "1500" },
    filing: "2025-11-14", klass: "micro",
    why: "A non-VAT taxpayer subject to percentage tax on amusement places files Form 2551Q.",
    hints: ["Amusement places pay 18% (PT 150).", "September 30 plus 25 days is October 25; count to November 14.", "Penalties are computed on the tax still payable (Item 19)."],
    solution: ["Line 1: 18% × ₱450,000 = ₱81,000. Line 2: 3% × ₱300,000 = ₱9,000. Total tax due = ₱90,000.", "Credits ₱5,000; tax still payable (Item 19) = ₱85,000.", "Surcharge = 10% × ₱85,000 = ₱8,500; interest = ₱85,000 × 6% × 20 ÷ 365 = ₱279.45 → ₱279; compromise ₱1,500; total penalties ₱10,279. Item 24 = ₱95,279."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 2551Q: Quarterly Percentage Tax Return", minutes: "About 6 minutes",
  sections: [
    ["1. Who pays percentage tax", "A person whose sales or receipts are not subject to VAT may be subject to the PERCENTAGE TAX, a tax on gross receipts. The common case is a non-VAT small business (gross sales under the VAT threshold), taxed 3% under Sec. 116 (ATC PT 010). Other businesses are taxed under their own sections: domestic carriers 3% (PT 040), radio and television franchises 3% (PT 070), insurance agents 4% (PT 130), amusement places 18% (PT 150), and so on (the ATC table is printed on the form). An individual who elected the 8% income tax rate on gross receipts does NOT pay percentage tax and files no 2551Q for that income (Item 13). The return is filed every quarter, including the fourth, within 25 days after the quarter (Code Sec. 128)."],
    ["2. Filling it", "Schedule 1 lists each ATC with the taxable amount (gross receipts), the rate, and the tax due; the total goes to Part II. Part II credits creditable percentage tax withheld per Form 2307, tax paid in an earlier return if amended, and other credits; the result is the tax still payable. A late return carries surcharge, interest and compromise computed on the tax still payable (25% and 12% in general; 10% and 6% for micro and small taxpayers)."],
  ],
  worked: { intro: "A non-VAT store: gross receipts ₱400,000 (PT 010) and a 2307 of ₱2,000.", steps: ["Tax due = 3% × ₱400,000 = ₱12,000.", "Tax still payable = ₱12,000 − ₱2,000 = ₱10,000."], title: "Form 2551Q", table: { "Sch.1 amount": "400,000", "Sch.1 tax": "12,000", "14": "12,000", "15": "2,000", "19": "10,000" } },
  legal: ["NIRC Secs. 116 to 128 (percentage taxes; Sec. 128 return and payment); BIR Form 2551Q (January 2018 ENCS) and its ATC table; RA 11976 (EOPT) for penalties."],
  guide: [
    ["1 to 5", "1", "Calendar or fiscal, year ended, quarter, amended, sheets.", "Your records.", "Quarter confusion."],
    ["6 to 13", "6", "TIN, RDO, name, address, contact, email, tax relief, 8% election.", "COR.", "8% election Yes with percentage tax due."],
    ["Sch. 1", "m1A", "ATC per line, taxable amount (gross receipts); the tax is computed.", "Sales records.", "Wrong ATC rate."],
    ["14 to 19", "15A", "Computed total; creditable percentage tax withheld; amended credit; other; tax still payable.", "2307, earlier return.", "Using 2307 of other taxes."],
    ["20 to 24", "22A", "Surcharge and interest from the filing date; compromise typed; total.", "Filing date.", "Penalty on the total tax."],
  ],
  checklist: ["Confirm you are non-VAT and did not elect 8%.", "Total gross receipts by type.", "Collect the 2307s for percentage tax.", "File within 25 days after the quarter."],
  pitfalls: ["Percentage tax after electing 8%.", "Wrong ATC.", "Missing the fourth quarter.", "Late filing."],
  amended: "Tick Yes in Item 4 and enter the tax paid in the original return in Item 16.",
  noPayment: "Zero receipts still require a return for the quarter.",
  quiz: [
    ["The percentage tax rate under Sec. 116 (PT 010) printed on the form is:", ["1%", "3%", "12%", "18%"], 1, "3%."],
    ["An individual who elected the 8% income tax rate pays percentage tax:", ["Always", "Never on that income", "Only in Q4", "Half"], 1, "The 8% rate is in lieu of the percentage tax."],
    ["Amusement places (PT 150) are taxed at:", ["3%", "10%", "18%", "30%"], 2, "18%."],
    ["Receipts ₱300,000 at 3% gives:", ["₱3,000", "₱9,000", "₱30,000", "₱90,000"], 1, "₱9,000."],
    ["2551Q is filed:", ["Monthly", "Quarterly", "Annually", "Weekly"], 1, "Each quarter."],
  ],
});
