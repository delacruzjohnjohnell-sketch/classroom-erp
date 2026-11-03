// Lecture, filling guide, tips and quick check for BIR Form 1701Q. Written for college students.
import type { GuideRow, QuizItem } from "./f1701a";
import { AS_OF } from "./f1701a";
export { AS_OF };

export const LECTURE = {
  title: "BIR Form 1701Q: Quarterly Income Tax Return for individuals, estates and trusts",
  minutes: "About 9 minutes",
  sections: [
    { heading: "1. Who files and for which quarters", body: [
      "Individuals who earn from business or a profession (single proprietors, professionals, and the mixed-income earner's business side), and estates and trusts, pay income tax in advance through quarterly returns. There are three 1701Q returns a year: for the first quarter (January to March), the second quarter (April to June) and the third quarter (July to September). There is no 1701Q for the fourth quarter: the annual return (1701 or 1701A) covers the whole year.",
      "A pure compensation earner does not file the 1701Q.",
    ] },
    { heading: "2. The computation is cumulative", body: [
      "Each quarterly return declares the income TO DATE, not just the quarter. With graduated rates, you compute this quarter's net income (Items 36 to 41), add the taxable income of the previous quarter/s (Item 42) and other income (Items 43 and 44) to get the total taxable income to date (Item 45), and apply the graduated table (Item 46). With the 8% rate, you add this quarter's income (Items 47 to 49) to the cumulative income of the previous quarter (Item 50), subtract the ₱250,000 once (Item 52), and take 8% (Item 54).",
      "The tax due is then reduced by the credits (Schedule III): the prior year's excess credits (Item 55), tax already paid with the previous quarter returns (Item 56), creditable tax withheld in the previous quarters (Item 57), the Forms 2307 of this quarter (Item 58), tax paid in a previously filed return if amended (Item 59), foreign tax credits (60) and other credits (61). The result (Item 63) is the amount payable now.",
      "Because the credits include earlier payments, the cumulative method means you never pay the same tax twice.",
    ] },
    { heading: "3. Choosing the tax rate and the deduction method", body: [
      "In Item 16 choose graduated rates (with itemized deductions or the 40% OSD, Item 16A) or the 8% option. The election is made in the first quarterly return of the year and cannot be changed during the year. The 8% option is available only if gross sales/receipts and other non-operating income do not exceed ₱3,000,000. The OSD is 40% of the sales, revenues, receipts or fees (Item 36) and needs no proof; the itemized deductions need receipts. Items 36 to 46 are for graduated, 47 to 54 for the 8% rate.",
      "The ATC must agree with the rate and with the taxpayer type: II012 business graduated, II014 profession graduated, II015 business 8%, II017 profession 8% (and II013/II016 for mixed income).",
    ] },
    { heading: "4. Deadlines, amendments and penalties", body: [
      "According to the form's own Guidelines and Instructions, the first quarter return is due on or before May 15, the second on August 15 and the third on November 15 of the current taxable year. (The eFPS help page still shows April 15 for the first quarter; the lab follows the form's instructions.) A late return carries surcharge, interest and compromise: 25% and 12% a year in general, 10% and 6% for micro and small taxpayers; verify the current rates (see the rules file).",
      "Tick Yes in Item 3 only to amend a return already filed for that quarter, and enter the tax paid in it in Item 59.",
    ] },
  ],
  worked: {
    intro: "Nena, a carinderia owner who elected the 8% rate, had ₱400,000 of receipts in the first quarter. A 2307 shows ₱2,000 withheld.",
    steps: [
      "Item 47 = ₱400,000. Item 49 = ₱400,000 = Item 51 (no previous quarter). Item 52 = ₱250,000, Item 53 = ₱150,000.",
      "Tax due (Item 54) = 8% × ₱150,000 = ₱12,000. Credits (Item 62) = ₱2,000. Tax payable (Item 63) = ₱10,000.",
      "In the second quarter, with another ₱500,000 of receipts, Item 50 would be ₱400,000: Item 51 = ₱900,000, Item 53 = ₱650,000, tax = ₱52,000, less the ₱12,000 paid in Item 56.",
    ],
    tables: [{ title: "Schedule II and III (8%)", data: { "47": "400,000", "49": "400,000", "51": "400,000", "52": "250,000", "53": "150,000", "54": "12,000", "58": "2,000", "62": "2,000", "63": "10,000" } }],
  },
  legal: [
    "NIRC Secs. 74 and 75: quarterly declaration and payment of income tax; Sec. 24(A)(2) as amended by RA 10963 for the rates and the 8% option; Sec. 34(L) for OSD.",
    "Guidelines and Instructions for BIR Form 1701Q [January 2018 (ENCS)]: when and where to file, deadlines, attachments.",
    "NIRC Secs. 248-249 and RA 11976 (EOPT) for penalties; RMC 20-2026 on forms.",
    `Rules in this lab are as of ${AS_OF}.`,
  ],
};

export const GUIDE: GuideRow[] = [
  { item: "1 to 4", field: "1", enter: "Year (YYYY), quarter (First, Second or Third), amended or not, number of sheets attached.", source: "Your records.", mistake: "Choosing a fourth quarter, which does not exist." },
  { item: "5 and 6", field: "5", enter: "TIN (3-3-3-5) and RDO code.", source: "COR.", mistake: "Using the filing branch's RDO." },
  { item: "7 and 8", field: "7", enter: "Taxpayer type, then the ATC that matches your type and rate.", source: "COR and your rate election.", mistake: "ATC II012 with the 8% rate." },
  { item: "9 to 15", field: "9", enter: "Name, registered address, ZIP, birth date, email, citizenship, foreign tax credit answer.", source: "COR.", mistake: "Name order." },
  { item: "16 and 16A", field: "16", enter: "Graduated or 8%; if graduated, itemized deductions or OSD.", source: "Your first quarterly return of the year.", mistake: "Switching rate in a later quarter." },
  { item: "17 to 25A", field: "17", enter: "Spouse's information, only if the spouse also has business or professional income.", source: "Spouse's COR.", mistake: "Filling Part II for a spouse who has only a salary." },
  { item: "36 and 37", field: "36A", enter: "Sales/revenues/receipts/fees this quarter, and cost of sales (itemized only).", source: "Books.", mistake: "Entering year-to-date sales." },
  { item: "38 to 41", field: "38A", enter: "Computed: gross income, then net income this quarter (after itemized deductions or OSD).", source: "Computed.", mistake: "Typing itemized deductions when you chose OSD." },
  { item: "39", field: "39A", enter: "Total allowable itemized deductions this quarter (itemized only).", source: "Ledger and receipts.", mistake: "Using cumulative expenses." },
  { item: "42 to 44", field: "42A", enter: "Taxable income of the previous quarter/s, non-operating income (specify), share in GPP income.", source: "Last quarter's Item 45.", mistake: "Forgetting Item 42 in the second and third quarter." },
  { item: "45 and 46", field: "45A", enter: "Computed: total taxable income to date, and the tax from the table of the year.", source: "Computed.", mistake: "Wrong year's table." },
  { item: "47 to 49", field: "47A", enter: "Receipts and other non-operating income of the quarter (8% path); the total is computed.", source: "Books.", mistake: "Putting them in Item 36." },
  { item: "50", field: "50A", enter: "Cumulative taxable income of the previous quarter (Item 51 of that return).", source: "Last quarter's return.", mistake: "Entering only the previous quarter's income, not the cumulative." },
  { item: "51 to 54", field: "52A", enter: "Computed: cumulative income, the ₱250,000 reduction, taxable income to date and the 8% tax.", source: "Computed.", mistake: "Deducting ₱250,000 every quarter." },
  { item: "55 to 61", field: "55A", enter: "Credits: prior year excess, earlier payments, earlier withholding, this quarter's 2307s, tax paid if amended, foreign credits, others (specify).", source: "Your earlier 1701Qs and 2307s.", mistake: "Claiming a 2307 twice." },
  { item: "62 and 63", field: "62A", enter: "Computed: total credits and tax payable/(overpayment).", source: "Computed.", mistake: "Ignoring a negative." },
  { item: "64 to 68", field: "64A", enter: "Surcharge and interest (computed from the filing date), compromise (typed), total penalties, total amount payable.", source: "Filing date and RDO.", mistake: "Penalty on the tax due instead of the payable." },
];

export const TIPS = {
  checklist: [
    "Check which quarter you are filing and its deadline: May 15, August 15 or November 15.",
    "Confirm your rate election from the first quarter and keep it for the whole year.",
    "Get last quarter's Item 45 (graduated) or Item 51 (8%) for the cumulative line.",
    "List each earlier payment and each 2307 by quarter so none is claimed twice.",
    "Total the quarter's sales and deductions from your books.",
  ],
  pitfalls: [
    "Computing only the quarter's income and ignoring the cumulative lines.",
    "Taking the ₱250,000 reduction every quarter instead of once.",
    "Wrong ATC for the rate (II012/II014 are graduated; II015/II017 are 8%).",
    "Claiming a 2307 on the quarterly return and again on the annual return.",
    "Filing a 1701Q for the fourth quarter.",
    "OSD plus actual expenses (no double deduction).",
    "Centavos: the form is in whole pesos.",
  ],
  amended: "To correct a filed quarterly return, tick Yes in Item 3, fill the whole form with the corrected figures, and put the tax paid in the original return in Item 59.",
  noPayment: "If the credits cover the tax, or the cumulative taxable income is below the zero-bracket (₱250,000), there is no payment, but the return is still due on the quarter's deadline.",
};

export const QUIZ: QuizItem[] = [
  { q: "Per the form's own instructions, the first quarter 1701Q for 2025 is due:", choices: ["April 15, 2025", "May 15, 2025", "June 30, 2025", "April 15, 2026"], answer: 1, explain: "First quarter: May 15; second: August 15; third: November 15." },
  { q: "How many 1701Q returns does an individual file in a year?", choices: ["One", "Two", "Three", "Four"], answer: 2, explain: "Three. The annual return takes the place of a fourth quarter." },
  { q: "Cumulative receipts through the second quarter are ₱900,000 (8% option). What is the taxable income to date (Item 53)?", choices: ["₱900,000", "₱650,000", "₱250,000", "₱52,000"], answer: 1, explain: "₱900,000 − ₱250,000 = ₱650,000 (the reduction is taken once from cumulative income). The tax is 8% = ₱52,000." },
  { q: "Where do you put the payments you made with the first quarterly return when you file the second?", choices: ["Item 55", "Item 56", "Item 58", "Item 60"], answer: 1, explain: "Item 56: tax payment/s for the previous quarter/s." },
  { q: "The ATC for a professional on the 8% rate is:", choices: ["II012", "II014", "II015", "II017"], answer: 3, explain: "II017: income from profession, 8% IT rate." },
];
