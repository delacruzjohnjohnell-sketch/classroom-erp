// Lecture, filling guide, tips and quick check for BIR Form 1700. Written for college students.
import type { GuideRow, QuizItem } from "./f1701a";
import { AS_OF } from "./f1701a";
export { AS_OF };

export const LECTURE = {
  title: "BIR Form 1700: Annual Income Tax Return for individuals earning purely compensation income",
  minutes: "About 8 minutes",
  sections: [
    { heading: "1. Who files Form 1700", body: [
      "An individual whose income is purely compensation (salary, wages, allowances, 13th month pay above the exempt amount) files Form 1700 when the employer cannot do substituted filing. The common reasons: the employee had two or more employers in the year, or the employer did not withhold correctly, or the employee has other non-business income (for example an honorarium) that was not subject to withholding. Form 1700 also covers non-resident aliens not engaged in trade or business (NRANETB), who pay a flat 25% on their gross compensation.",
      "If the employee has a business or profession on the side, that is mixed income and the form is Form 1701. If the employee earns only from one employer for the whole year and the employer withheld the correct tax, the 2316 issued by the employer is the final paper and no return is needed (substituted filing).",
    ] },
    { heading: "2. Gross compensation, exempt amounts and taxable compensation", body: [
      "Schedule 1 lists each employer with the gross compensation and the tax withheld (from the Form 2316 each employer issues). Item 42 is the total gross compensation. Item 43 is the non-taxable or exempt portion: mandatory contributions to SSS, PhilHealth and Pag-IBIG, and the 13th month pay and other benefits up to ₱90,000 (RA 10963). Anything above ₱90,000 stays taxable. Item 44 is gross compensation less the exempt portion.",
      "Other taxable non-business income that was not subject to final tax or withholding (an honorarium, a prize above the exempt level, a commission outside of a business) is added in Item 45.",
    ] },
    { heading: "3. The tax", body: [
      "Resident citizens and resident aliens use the graduated table: for 2023 onwards, 0% up to ₱250,000; 15% of the excess over ₱250,000 up to ₱400,000; ₱22,500 + 20% over ₱400,000 up to ₱800,000; ₱102,500 + 25% over ₱800,000 up to ₱2,000,000; ₱402,500 + 30% over ₱2,000,000 up to ₱8,000,000; ₱2,202,500 + 35% beyond. Taxable years 2018 to 2022 use the older Table 1 printed on the form. NRANETB pay a flat 25% (Part V.B).",
      "Credits (Part V.C): the tax withheld per the 2316s, tax paid in an earlier return if this return is amended, foreign tax credits and other payments. The net tax payable is Item 47 (or 53) less the credits. Since the tax is withheld during the year, a compensation earner often owes little or even has an overpayment.",
    ] },
    { heading: "4. Deadline, installment and penalties", body: [
      "The annual return is due on or before April 15 of the following year (stated on the BIR forms page for Form 1700). Employees under regular rates with a net payable may pay up to 50% of the tax due on or before October 15 (Item 29, the second installment). A return filed late carries a surcharge (25%, or 10% for micro and small taxpayers), interest (12% a year, or 6%), and a compromise penalty. Verify the current classification and rates (see the rules file).",
      "Married individuals may file jointly: the spouse's information goes to Part II and the spouse's income and tax go to column B. Each spouse is taxed separately on their own income; the aggregate amount is what the couple pays.",
    ] },
  ],
  worked: {
    intro: "Mark has two employers in 2025: ₱350,000 (tax withheld ₱12,000) and ₱250,000 (tax withheld ₱10,000). His non-taxable compensation is ₱70,000. He files on time.",
    steps: [
      "Gross compensation (Item 42) = ₱350,000 + ₱250,000 = ₱600,000. Less exempt ₱70,000: Item 44 = ₱530,000 = Item 46.",
      "Tax (Item 47) = ₱22,500 + 20% × (₱530,000 − ₱400,000) = ₱22,500 + ₱26,000 = ₱48,500.",
      "Tax withheld (Item 54) = ₱22,000. Net payable (Item 59) = ₱48,500 − ₱22,000 = ₱26,500.",
    ],
    tables: [{ title: "Form 1700 (resident employee)", data: { "42": "600,000", "43": "70,000", "44": "530,000", "46": "530,000", "47": "48,500", "54": "22,000", "58": "22,000", "59": "26,500" } }],
  },
  legal: [
    "NIRC Sec. 24(A)(1) and Sec. 25(B) (25% for NRANETB), as amended by RA 10963 (TRAIN).",
    "NIRC Sec. 32(B)(7)(e): 13th month pay and other benefits exempt up to ₱90,000. Sec. 51(A)(2)(a) and Sec. 51(B): who must file and when. Sec. 56: payment in installments.",
    "NIRC Secs. 248-249 and RA 11976 (EOPT): penalties.",
    `Rules in this lab are as of ${AS_OF}. The ₱90,000 ceiling and the NRANETB 25% rate are from the Code (the 25% is printed on the form); the form has no instruction page for the due date.`,
  ],
};

export const GUIDE: GuideRow[] = [
  { item: "1 to 3", field: "1", enter: "Taxable year (2025), amended or not, and ATC II011 (compensation income).", source: "Your 2316s.", mistake: "Writing the filing year (2026) in Item 1." },
  { item: "4 and 5", field: "4", enter: "Your TIN (3-3-3-5) and RDO code.", source: "Your 2316 or TIN card.", mistake: "Leaving out the branch code." },
  { item: "6", field: "6", enter: "Employee (regular rates) for residents; NRANETB for a non-resident alien not engaged in trade or business (25%).", source: "Your status.", mistake: "Choosing NRANETB for a Filipino." },
  { item: "7 to 14", field: "7", enter: "Name, registered address and ZIP, birth date, email, citizenship, foreign tax credit answer, contact number.", source: "ID and 2316.", mistake: "Name not in Last, First, Middle order." },
  { item: "15 to 17", field: "15", enter: "Civil status; whether the spouse has income; joint or separate filing.", source: "Your family status.", mistake: "Choosing Joint Filing but leaving Part II empty." },
  { item: "18 to 21", field: "18", enter: "Spouse's TIN, RDO, type and name, only for a joint return.", source: "Spouse's 2316.", mistake: "Missing spouse TIN." },
  { item: "Sch. 1 (c, e)", field: "S1cA", enter: "For each employer: compensation subject to regular rates (c) and tax withheld (e).", source: "Box of Form 2316 of each employer.", mistake: "Leaving out the earlier employer." },
  { item: "Sch. 1 totals", field: "S5cA", enter: "Computed totals of columns c, d, e.", source: "Computed by the form.", mistake: "Overwriting them." },
  { item: "42 and 44", field: "42A", enter: "Computed: gross compensation from the schedule, and gross compensation less Item 43.", source: "Computed.", mistake: "Subtracting 13th month pay in full when it is over ₱90,000." },
  { item: "43", field: "43A", enter: "Non-taxable/exempt compensation: contributions, and 13th month pay and benefits up to ₱90,000.", source: "Payroll breakdown on the 2316.", mistake: "Exempting the whole 13th month pay." },
  { item: "45 and 46", field: "45A", enter: "Other taxable non-business income (specify) and the computed total taxable income.", source: "Receipts for honorarium, etc.", mistake: "Forgetting income not subject to withholding." },
  { item: "47", field: "47A", enter: "Computed: tax from the table of the taxable year.", source: "Computed.", mistake: "Using the 2018-2022 table for 2025." },
  { item: "48 to 53", field: "53A", enter: "Part V.B, only for an NRANETB: 25% of the taxable compensation.", source: "Computed.", mistake: "Filling both Part V.A and V.B." },
  { item: "54 to 59", field: "55A", enter: "Tax withheld (computed from Schedule 1), tax paid in an earlier return (amended only), foreign tax credit, other credits (specify). Total credits and net payable are computed.", source: "Your 2316s.", mistake: "Putting withheld tax in Item 55." },
  { item: "26 to 28", field: "26A", enter: "Computed: tax due, total credits, net payable.", source: "Computed.", mistake: "Typing them." },
  { item: "29 and 30", field: "29A", enter: "Part of the payable to be paid on or before October 15 (up to 50% of Item 26), then the amount payable now.", source: "Your choice.", mistake: "Using the installment with NRANETB rates." },
  { item: "31 to 35", field: "31A", enter: "Surcharge, interest (computed from the filing date), compromise (typed), total penalties and total amount payable.", source: "Filing date and RDO assessment.", mistake: "Computing the penalty on Item 26 instead of Item 30." },
  { item: "37", field: "37", enter: "Number of attachments (the 2316s).", source: "Your list.", mistake: "Leaving it blank." },
];

export const TIPS = {
  checklist: [
    "Gather every Form 2316 for the year, one from each employer.",
    "Check the exempt portion: contributions plus 13th month and other benefits up to ₱90,000.",
    "List any income not subject to withholding (honorarium, side commission) for Item 45.",
    "Check the civil status and decide whether to file jointly or separately.",
    "Know your filing date; after April 15 expect a surcharge, interest and a compromise.",
  ],
  pitfalls: [
    "Wrong form: if there is a business, file 1701, not 1700.",
    "Counting the whole 13th month pay as exempt when it is over ₱90,000.",
    "Using the 2018-2022 table for a 2023 or later year.",
    "Forgetting an employer from earlier in the year.",
    "Using the 50% installment on NRANETB rates, or on more than 50% of Item 26.",
    "Filling Part V.A and V.B at the same time.",
    "Entering centavos: 1700 is in whole pesos.",
  ],
  amended: "Tick Yes in Item 2 only to correct a return you already filed for the same year, and enter the tax paid in the original return in Item 55 so it is credited.",
  noPayment: "If the tax withheld equals or exceeds the tax due, there is nothing to pay, but a Form 1700 that must be filed is still due by April 15. An overpayment may be carried over or refunded as the return states.",
};

export const QUIZ: QuizItem[] = [
  { q: "Lito worked for one employer all year and the employer withheld the correct tax. Does he need to file Form 1700?", choices: ["Yes, always", "No, substituted filing applies", "Yes, if he is married", "Yes, if he earned over ₱250,000"], answer: 1, explain: "A pure compensation earner with one employer for the whole year and correct withholding is covered by substituted filing, using the 2316." },
  { q: "An employee received a 13th month pay of ₱120,000. What is the exempt part?", choices: ["₱120,000", "₱90,000", "₱30,000", "₱0"], answer: 1, explain: "The 13th month pay and other benefits are exempt only up to ₱90,000; the ₱30,000 excess is taxable." },
  { q: "Taxable compensation for 2025 is ₱500,000. What is the tax due under Table 2?", choices: ["₱42,500", "₱52,500", "₱60,000", "₱102,500"], answer: 0, explain: "₱22,500 + 20% × (₱500,000 − ₱400,000) = ₱42,500." },
  { q: "A non-resident alien not engaged in trade or business with taxable compensation of ₱400,000 pays:", choices: ["₱22,500", "₱60,000", "₱100,000", "₱0"], answer: 2, explain: "NRANETB pay a flat 25% (Part V.B): 25% × ₱400,000 = ₱100,000." },
  { q: "What is the most the second installment (Item 29) can be?", choices: ["25% of Item 26", "50% of Item 26", "100% of Item 28", "50% of the withholding"], answer: 1, explain: "The form allows 50% or less of Item 26, the tax due, for employees under regular rates." },
];
