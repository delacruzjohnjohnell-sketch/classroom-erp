// BIR Form 1604-E, January 2018 (ENCS): Annual Information Return of Creditable Income Taxes Withheld (Expanded) / Income Payments Exempt from Withholding Tax.
// Item numbers follow docs/bir-forms/1604-E-Jan-2018.pdf. Due on or before March 1 of the following year (eFPS help page of Form 1604-E). Information return: no payment.
import { RULES } from "../rules/2026";
import { f, fields, makeForm, opts, radio, yes } from "../forms/kit";
import type { Values } from "../forms/types";
import { caseOf, lessonOf, ymd } from "./kit";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const year = (v: Values) => (/^\d{4}$/.test(v["1"] ?? "") ? Number(v["1"]) : 0);

export const DEF = makeForm({
  id: "1604-E", number: "1604-E", title: "Annual Information Return of Creditable Income Taxes Withheld (Expanded)", subtitle: "Income Payments Exempt from Withholding Tax; information return: no payment",
  version: "January 2018 (ENCS)", versionNote: "Official PDF: 1604E Jan 2018 ENCS Final2. Due March 1 of the following year (eFPS Guidelines of Form 1604-E).",
  yearId: "1",
  identity: [
    fields(f("1", "1", "For the Year (YYYY)", "year", { span: 3, required: true }), yes("2", "2", "Amended Return?", 3), f("3", "3", "Number of Sheet/s Attached", "count", { span: 3, required: true })),
    fields(f("4", "4", "Taxpayer Identification Number (TIN)", "tin", { span: 7, required: true }), f("5", "5", "RDO Code", "rdo", { span: 5, required: true })),
    fields(f("6", "6", "Withholding Agent's Name (Last Name, First Name, Middle Name OR Registered Name)", "text", { span: 12, required: true })),
    fields(f("7", "7", "Registered Address", "text", { span: 9, required: true }), f("7A", "7A", "ZIP Code", "zip", { span: 3, required: true })),
    radio("8", "8", "Category of Withholding Agent", opts(["private", "Private"], ["government", "Government"])),
    fields(yes("8A", "8A", "If private, top withholding agent?", 4), f("9", "9", "Contact Number", "phone", { span: 4 }), f("10", "10", "Email Address", "email", { span: 4 })),
  ],
  required: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }, { id: "5" }, { id: "6" }, { id: "7" }, { id: "7A" }, { id: "8" }, { id: "8A" }].map((r) => ({ ...r, message: `Item ${r.id} is required.` })),
  formats: { tin: ["4"], rdo: ["5"], zip: ["7A"], email: ["10"] },
  sections: [
    { id: "s1", title: "Schedule 1 – Remittance per BIR Form No. 1601-EQ", note: "Taxes withheld per quarter and the penalties paid with that quarter's 1601-EQ.", lines: [
      ...[1, 2, 3, 4].flatMap((q): ({ id: string; item: string; label: string })[] => [{ id: `q${q}`, item: `${q}Q tax`, label: `Quarter ${q}: Taxes Withheld` }, { id: `p${q}`, item: `${q}Q pen`, label: `Quarter ${q}: Penalties` }]),
      { id: "qT", item: "TOTAL", label: "TOTAL Taxes Withheld per 1601-EQ", f: (c) => c.n("q1") + c.n("q2") + c.n("q3") + c.n("q4"), bold: true, key: true },
      { id: "qP", item: "TOTAL pen.", label: "TOTAL Penalties", f: (c) => c.n("p1") + c.n("p2") + c.n("p3") + c.n("p4") },
      { id: "qR", item: "Remitted", label: "TOTAL Amount Remitted per 1601-EQ (Taxes Withheld + Penalties)", f: (c) => c.n("qT") + c.n("qP"), bold: true, key: true },
    ] },
    { id: "s2", title: "Schedule 2 – Remittance per BIR Form No. 1606", note: "Taxes withheld per month on sales of real property (ordinary assets).", lines: [
      ...MONTHS.map((m, i) => ({ id: `r${i + 1}`, item: m, label: `${m}: Taxes Withheld (1606)` })),
      { id: "rT", item: "TOTAL", label: "TOTAL Taxes Withheld per 1606", f: (c) => Array.from({ length: 12 }, (_, i) => c.n(`r${i + 1}`)).reduce((a, b) => a + b, 0), bold: true, key: true },
      { id: "tot", item: "ALL", label: "GRAND TOTAL Taxes Withheld (Schedules 1 and 2)", f: (c) => c.n("qT") + c.n("rT"), bold: true, key: true },
    ] },
  ],
  due: (v) => (year(v) ? ymd(year(v) + 1, RULES.informationReturnDue.form1604E.month, RULES.informationReturnDue.form1604E.day) : ""),
});

const P = (n: number, rdo: string, name: string, addr: string, zip: string, extra: Values = {}): Values => ({ "4": `000-${n}-222-00000`, "5": rdo, "6": name, "7": addr, "7A": zip, "9": `0917000${n}`, "10": `tax${n}@example.com`, ...extra });
const common = { "1": "2025", "2": "no", "8": "private" } as const;

export const CASES = [
  caseOf({
    form: "1604-E", level: "easy", year: 2025, title: "Four quarters of expanded withholding",
    story: ["Gapan Grains & Feeds, Inc. (Gapan City) is NOT a top withholding agent. Its 1601-EQ returns for 2025 show taxes withheld of ₱12,000 (1st quarter), ₱15,000, ₱14,000 and ₱18,000 (4th quarter), all paid on time with no penalties and no 1606.", "Prepare the 1604-E for 2025 (one attachment: the alphalist), due March 1, 2026. Nothing is paid with it."],
    profile: P(121, "027", "GAPAN GRAINS & FEEDS, INC.", "NATIONAL HIGHWAY, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "3": "1", "8A": "no", q1A: "12000", q2A: "15000", q3A: "14000", q4A: "18000" },
    filing: "2026-02-20",
    why: "A withholding agent reports the year's expanded withholding with the annual information return 1604-E.",
    hints: ["Schedule 1 comes from the four 1601-EQ returns.", "No 1606 means Schedule 2 is empty.", "Total remitted = taxes withheld + penalties."],
    solution: ["Taxes withheld per 1601-EQ = ₱12,000 + ₱15,000 + ₱14,000 + ₱18,000 = ₱59,000.", "Penalties ₱0; total remitted ₱59,000. Grand total taxes withheld ₱59,000."],
  }),
  caseOf({
    form: "1604-E", level: "average", year: 2025, title: "A late quarter and a real property sale",
    story: ["Mabini Realty Corp. (Cabanatuan City) withheld: 1st quarter ₱30,000; 2nd ₱28,500 with a ₱1,500 penalty (filed late); 3rd ₱31,000; 4th ₱35,500. It also remitted 1606 withholding on the sale of an ordinary-asset lot: ₱60,000 in March and ₱45,000 in September.", "Prepare the 1604-E for 2025 with two attachments."],
    profile: P(122, "025", "MABINI REALTY CORP.", "BRGY. MABINI, CABANATUAN CITY, NUEVA ECIJA", "3100"),
    facts: { ...common, "3": "2", "8A": "no", q1A: "30000", q2A: "28500", p2A: "1500", q3A: "31000", q4A: "35500", r3A: "60000", r9A: "45000" },
    filing: "2026-02-25",
    why: "A withholding agent reports the year's expanded withholding with 1604-E, including 1606 remittances.",
    hints: ["Schedule 2 months: March = month 3, September = month 9.", "Penalties are totalled separately in Schedule 1.", "Grand total adds both schedules' taxes withheld."],
    solution: ["Schedule 1 taxes = ₱30,000 + ₱28,500 + ₱31,000 + ₱35,500 = ₱125,000; penalties ₱1,500; total remitted ₱126,500.", "Schedule 2 taxes = ₱60,000 + ₱45,000 = ₱105,000.", "Grand total taxes withheld = ₱125,000 + ₱105,000 = ₱230,000."],
  }),
  caseOf({
    form: "1604-E", level: "difficult", year: 2025, title: "A top withholding agent, amended return",
    story: ["Gapan Manufacturing Corp. (Gapan City) is a top withholding agent. 2025 quarterly withholding per 1601-EQ: ₱82,000, ₱91,500, ₱88,000 and ₱104,500, with penalties of ₱2,000 in the 3rd quarter. 1606 withholding: ₱120,000 in June. This is an amended return (Item 2 = Yes) to correct the 4th quarter figure.",
      "Prepare the amended 1604-E for 2025 with four attachments."],
    profile: P(123, "027", "GAPAN MANUFACTURING CORP.", "BRGY. MAPALAD, GAPAN CITY, NUEVA ECIJA", "3105"),
    facts: { ...common, "2": "yes", "3": "4", "8A": "yes", q1A: "82000", q2A: "91500", q3A: "88000", p3A: "2000", q4A: "104500", r6A: "120000" },
    filing: "2026-02-27",
    why: "A withholding agent reports expanded withholding with the annual information return 1604-E; an amended return uses the same form.",
    hints: ["Item 2 Yes marks the amended return.", "Quarterly taxes withheld and penalties go to separate rows.", "June is month 6 in Schedule 2."],
    solution: ["Schedule 1 taxes = ₱82,000 + ₱91,500 + ₱88,000 + ₱104,500 = ₱366,000; penalties ₱2,000; total remitted ₱368,000.", "Schedule 2 taxes = ₱120,000. Grand total taxes withheld = ₱366,000 + ₱120,000 = ₱486,000."],
  }),
];

export const BODY = lessonOf({
  title: "BIR Form 1604-E: Annual Information Return of Creditable Income Taxes Withheld (Expanded)", minutes: "About 5 minutes",
  sections: [
    ["1. What it is", "Every withholding agent that withheld expanded (creditable) income tax, or made income payments exempt from withholding but still subject to income tax, files the annual information return 1604-E. It consolidates the four quarterly 1601-EQ remittances and the monthly 1606 remittances (tax withheld on sales of ordinary-asset real property). It is filed on or before March 1 of the year following (per the BIR guidance for Form 1604-E) with alphalists of payees as attachments. It is an information return: no payment is made with it (RMC 18-2021). A penalty applies to a failure to file (the guidance quotes ₱1,000 per failure, ₱25,000 a year at most)."],
    ["2. Filling it", "Part I identifies the withholding agent (private or government; top withholding agent or not). Schedule 1 lists each quarter's taxes withheld and penalties per the 1601-EQ. Schedule 2 lists the monthly taxes withheld per the 1606. The total amount remitted per schedule equals taxes withheld plus penalties. The figures must agree with the filed returns and with the payees' 2307 certificates."],
  ],
  worked: { intro: "A company withheld ₱10,000 each quarter and paid no penalties; no 1606.", steps: ["Schedule 1 total = ₱40,000; total remitted = ₱40,000."], title: "Form 1604-E", table: { "TOTAL": "40,000", "Remitted": "40,000", "GRAND TOTAL": "40,000" } },
  legal: ["NIRC Sec. 58 and Sec. 83; RR 2-98 as amended by RR 11-2018; BIR Form 1604-E (January 2018 ENCS); RMC 18-2021."],
  guide: [
    ["1 to 3", "1", "Year, amended or not, number of sheets.", "Your records.", "Filing year as the taxable year."],
    ["4 to 10", "4", "Agent's TIN, RDO, name, address, category, top withholding agent, contact, email.", "COR.", "Wrong category."],
    ["Sch. 1", "q1A", "Each quarter's taxes withheld and penalties per 1601-EQ.", "1601-EQ returns.", "Different from the 1601-EQ."],
    ["Sch. 2", "r1A", "Each month's taxes withheld per 1606.", "1606 returns.", "Wrong month."],
    ["Totals", "qT", "Computed totals and grand total.", "Computed.", "Adding penalties to taxes withheld."],
  ],
  checklist: ["Collect four 1601-EQ and the 1606 returns.", "Prepare the alphalist of payees.", "Reconcile with the 2307s issued.", "File by March 1."],
  pitfalls: ["Not matching 1601-EQ.", "Putting 1606 into Schedule 1.", "Late filing penalty."],
  amended: "Tick Yes in Item 2 to correct a filed 1604-E.",
  noPayment: "No payment is made with 1604-E.",
  quiz: [
    ["1604-E consolidates:", ["1601-C", "1601-EQ and 1606", "2550Q", "1701Q"], 1, "The quarterly expanded withholding and the 1606 returns."],
    ["Due date:", ["January 31", "March 1", "April 15", "June 30"], 1, "On or before March 1 of the following year."],
    ["A payment is made with 1604-E:", ["Always", "Never", "If late", "If government"], 1, "It is an information return."],
    ["Quarterly ₱10,000 and penalty ₱500 once. Total remitted:", ["₱40,000", "₱40,500", "₱41,000", "₱39,500"], 1, "₱40,000 + ₱500."],
    ["1606 withholding is entered in:", ["Schedule 1", "Schedule 2", "Part I", "Item 12"], 1, "Schedule 2."],
  ],
});
