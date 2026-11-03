// Lecture, filling guide, tips and quick check for BIR Form 1701. Written for college students.
import type { GuideRow, QuizItem } from "./f1701a";
import { AS_OF } from "./f1701a";
export { AS_OF };

export const LECTURE = {
  title: "BIR Form 1701: Annual Income Tax Return for individuals (including mixed income earners), estates and trusts",
  minutes: "About 10 minutes",
  sections: [
    { heading: "1. Who files Form 1701", body: [
      "Form 1701 is the annual return for (a) MIXED income earners: individuals with both compensation income and business or professional income, (b) self-employed individuals who use itemized deductions instead of the OSD, and (c) estates and trusts. A pure business earner on graduated-with-OSD or 8% files 1701A; a pure employee files 1700 (or nothing, if substituted filing applies).",
      "Mixed income needs the compensation schedules (Schedules 1 and 2) AND the business schedule (Schedule 3.A for graduated rates, or 3.B for 8%). Page 1 holds the identity, the choice of tax rate (Item 21) and method of deduction (Item 21A), the total tax payable (Part II) and payment details.",
    ] },
    { heading: "2. The mixed-income computation", body: [
      "Compensation: gross compensation per the 2316s (Schedule 1), less non-taxable compensation (contributions, 13th month up to ₱90,000), equals taxable compensation (Item 6). On graduated rates, taxable compensation and taxable business income are ADDED (Item 24) and ONE tax is computed on the total (Item 25). Do not compute two separate taxes under graduated rates.",
      "Business on graduated rates: net sales (Item 10), less cost of sales if itemized (Item 12), less itemized deductions (Schedule 4 ordinary deductions, plus special deductions and NOLCO) or the 40% OSD of net sales (Item 17), plus other non-operating income not subject to final tax (Items 19 to 22). Itemized deductions need receipts and proper withholding; the OSD does not.",
      "Business on the 8% rate: total income (Item 28), less the ₱250,000 reduction (Item 29) ONLY if the taxpayer has no compensation income, times 8% (Item 31). The tax on the compensation (Item 7) is added: Item 32 = Item 7 + Item 31. A mixed-income earner on 8% therefore gets NO ₱250,000 reduction on the business part.",
    ] },
    { heading: "3. Credits, installment and refund options", body: [
      "Part VII credits: prior year's excess credits, tax paid with the first three 1701Qs, creditable tax withheld in the first three quarters, creditable tax per the 2307s of the fourth quarter, tax withheld on compensation per the 2316s (Item 5, from Schedule 1), tax paid in an earlier return if amended, foreign tax credits, and other credits. Tax payable = tax due less credits.",
      "If the credits exceed the tax, mark one box for the overpayment: refund, tax credit certificate (TCC), or carry over; the choice is irrevocable. With a net payable, the individual may pay up to 50% of the Item 22 tax due on or before October 15 (Item 25).",
    ] },
    { heading: "4. Deadline and penalties", body: [
      "The annual return is due on or before April 15 following the taxable year (stated on the BIR forms page for Form 1701). A late return carries surcharge, interest and a compromise penalty: in general 25% and 12% a year; for micro and small taxpayers 10% and 6% (verify, see the rules file). Penalties are computed on the net tax payable after the installment (Item 26). This lab simplifies the form: special/preferential and exempt regimes (Parts VIII to X) and the detail of Schedules 5 and 6 are not simulated; Items 14 and 15 are typed as totals.",
    ] },
  ],
  worked: {
    intro: "Ana earns ₱420,000 as an employee (non-taxable ₱20,000; tax withheld ₱18,000) and has a small business with ₱300,000 of net sales on OSD.",
    steps: [
      "Taxable compensation = ₱400,000 (Item 6). OSD 40% × ₱300,000 = ₱120,000; net income = ₱180,000 (Item 18 = Item 23).",
      "Total taxable income (Item 24) = ₱400,000 + ₱180,000 = ₱580,000. Tax (Item 25) = ₱22,500 + 20% × ₱180,000 = ₱58,500.",
      "Credits: 2316 withholding ₱18,000. Tax payable = ₱58,500 − ₱18,000 = ₱40,500.",
    ],
    tables: [{ title: "Form 1701 (graduated, OSD)", data: { "4": "420,000", "5": "20,000", "6": "400,000", "10": "300,000", "17": "120,000", "18": "180,000", "24": "580,000", "25": "58,500", "VII-5": "18,000", "24 (Part II)": "40,500" } }],
  },
  legal: [
    "NIRC Sec. 24(A)(1) and (2) as amended by RA 10963 (TRAIN): graduated rates and the 8% option (the ₱250,000 reduction is for purely self-employed individuals); Sec. 34 for deductions and the 40% OSD; Sec. 51 and Sec. 56 for filing and installment.",
    "NIRC Sec. 32(B)(7)(e): 13th month pay and other benefits exempt up to ₱90,000.",
    "NIRC Secs. 248-249 and RA 11976 (EOPT): penalties.",
    `Rules in this lab are as of ${AS_OF}.`,
  ],
};

export const GUIDE: GuideRow[] = [
  { item: "1 to 3", field: "1", enter: "Taxable year, amended or not, short period or not.", source: "Your records.", mistake: "Short period Yes for an ordinary year." },
  { item: "4 to 8", field: "4", enter: "TIN, RDO, taxpayer type, ATC (II013/II016 for mixed income), name.", source: "COR.", mistake: "ATC II012 for a mixed-income earner." },
  { item: "9 to 18", field: "9", enter: "Address, ZIP, birth date, email, citizenship, civil status, spouse information and filing status.", source: "ID and COR.", mistake: "Joint filing without the spouse TIN." },
  { item: "19 and 20", field: "19", enter: "Whether any income is exempt or subject to a special rate. In this lab: No.", source: "Your income sources.", mistake: "Yes without filling Part X (not simulated)." },
  { item: "21 and 21A", field: "21", enter: "Graduated or 8%, and itemized or OSD.", source: "Your first 1701Q election.", mistake: "Changing the rate at year-end." },
  { item: "Sch. 1", field: "s1c1A", enter: "For each employer: compensation and tax withheld.", source: "Form 2316.", mistake: "Skipping an earlier employer." },
  { item: "5", field: "s5A", enter: "Non-taxable compensation.", source: "2316 breakdown.", mistake: "Exempting 13th month pay above ₱90,000." },
  { item: "6 and 7", field: "s6A", enter: "Computed: taxable compensation and its tax.", source: "Computed.", mistake: "Typing them." },
  { item: "8 to 12", field: "s8A", enter: "Sales, returns, net sales, cost of sales (itemized only), gross income.", source: "Books.", mistake: "Cost of sales with OSD." },
  { item: "13 to 16", field: "s4_1A", enter: "Itemized: Schedule 4 lines (computed into Item 13), special deductions (14), NOLCO (15); total (16).", source: "Ledger and receipts.", mistake: "Using itemized deductions without documentation." },
  { item: "17 and 18", field: "s17A", enter: "Computed OSD (40% of Item 10) or net income after itemized deductions.", source: "Computed.", mistake: "OSD and itemized together." },
  { item: "19 to 23", field: "s19A", enter: "Other non-operating income (specify), GPP share; computed taxable business income.", source: "Official receipts.", mistake: "Including final-taxed income." },
  { item: "24 and 25", field: "s24A", enter: "Computed: compensation plus business, then one tax on the total.", source: "Computed.", mistake: "Two separate taxes." },
  { item: "26 to 32", field: "s26A", enter: "8%: net receipts, other income; computed ₱250,000 reduction (none if compensation), 8% tax, plus tax on compensation.", source: "Computed.", mistake: "Taking the ₱250,000 as a mixed-income earner." },
  { item: "VII-1 to 9", field: "c1A", enter: "Credits: prior excess, quarterly payments, withholding, 2307s, amended, foreign, other.", source: "1701Qs, 2307s, 2316s.", mistake: "Claiming the 2316 twice." },
  { item: "22 to 26", field: "p22A", enter: "Computed tax due, credits, payable; installment (typed, up to 50% of Item 22).", source: "Computed.", mistake: "Installment on an overpayment." },
  { item: "27 to 31", field: "p27A", enter: "Interest and surcharge (computed from the filing date), compromise (typed), total penalties and amount payable.", source: "Filing date and RDO.", mistake: "Penalty on Item 22 instead of Item 26." },
  { item: "33 and OV", field: "33", enter: "Number of attachments; for an overpayment, the one box (refund, TCC or carry over).", source: "Your choice.", mistake: "Ticking two boxes." },
];

export const TIPS = {
  checklist: [
    "Confirm you really have mixed income: salary AND business or profession in the same year.",
    "Gather every 2316 and the quarterly 1701Q returns, plus all 2307s.",
    "Decide the rate and deduction method as in your first 1701Q.",
    "If itemized, prepare Schedule 4 with receipts, and check NOLCO from earlier years.",
    "Compute compensation first, then the business, then the combined tax.",
  ],
  pitfalls: [
    "Using 1701A for a mixed-income earner.",
    "Two separate taxes instead of one tax on the combined graduated income.",
    "The ₱250,000 reduction taken by a mixed-income earner on 8%.",
    "Itemized deductions without documents, or OSD together with actual expenses.",
    "Claiming 2316 withholding in the wrong line, or twice.",
    "Wrong ATC (II011 is compensation only).",
    "Centavos entered.",
  ],
  amended: "Tick Yes in Item 2 to correct a filed 1701, redo the whole form with the corrected figures, and enter the tax paid in the original return in Part VII Item 6.",
  noPayment: "If credits cover the tax, no payment is due, but the return is still filed by April 15. An overpayment needs one irrevocable choice: refund, TCC or carry over.",
};

export const QUIZ: QuizItem[] = [
  { q: "A bank employee also runs an online shop. Which annual return?", choices: ["1700", "1701A", "1701", "1702-RT"], answer: 2, explain: "Mixed income (compensation + business) is Form 1701." },
  { q: "A mixed-income earner on the 8% rate has business income of ₱400,000. How much is the reduction in Item 29?", choices: ["₱250,000", "₱150,000", "₱0", "₱400,000"], answer: 2, explain: "The ₱250,000 reduction is for purely self-employed individuals; with compensation income it is not applicable." },
  { q: "Taxable compensation is ₱300,000 and taxable business income (graduated) is ₱200,000. What is the tax under Table 2?", choices: ["₱22,500", "₱42,500", "₱37,500", "₱60,000"], answer: 1, explain: "One tax on the combined ₱500,000: ₱22,500 + 20% × ₱100,000 = ₱42,500." },
  { q: "Where does the tax withheld on the 2316 go?", choices: ["Part VII Item 2", "Part VII Item 5", "Part VII Item 4", "Part II Item 25"], answer: 1, explain: "Part VII Item 5: creditable tax withheld per BIR Form 2316, from Schedule 1." },
  { q: "The maximum second installment is:", choices: ["25% of Item 22", "50% of Item 22", "50% of Item 24", "100% of Item 26"], answer: 1, explain: "50% or less of Item 22, the tax due." },
];
