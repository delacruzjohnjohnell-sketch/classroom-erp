// Lecture, filling guide, tips and quick check for BIR Form 1701A. Written for college students. The legal basis is cited at the end of the lecture.
// Where a statement could not be checked against an official BIR document, it is marked "verify" so the instructor can confirm it.

export interface LectureSection { heading: string; body: string[] }
export interface GuideRow { item: string; field: string; enter: string; source: string; mistake: string }
export interface QuizItem { q: string; choices: string[]; answer: number; explain: string }

export const AS_OF = "November 3, 2026";

export const LECTURE: { title: string; minutes: string; sections: LectureSection[]; worked: { intro: string; steps: string[]; graduated: Record<string, string>; eight: Record<string, string> }; legal: string[] } = {
  title: "BIR Form 1701A: Annual Income Tax Return for individuals earning purely from business or profession",
  minutes: "About 12 minutes",
  sections: [
    {
      heading: "1. What the tax is and who is liable",
      body: [
        "Income tax is a tax on income earned in a year. A Filipino citizen or resident alien who earns from a business or from the practice of a profession (a sari-sari store owner, a freelance designer, a dentist, an accountant in private practice) must file an annual income tax return even if the quarterly returns already showed the tax. The annual return is where the year is added up, the quarterly payments and creditable withholding are credited, and the balance is paid or the overpayment is claimed.",
        "Form 1701A is for individuals whose income is PURELY from business or profession and who either (a) use the graduated income tax rates with the Optional Standard Deduction (OSD), or (b) opted for the 8% flat income tax rate on gross sales/receipts. It is the simplest annual return for the self-employed because it has no itemized-deduction schedules.",
      ],
    },
    {
      heading: "2. Is 1701A the right form? Compare with 1700, 1701 and 1701-MS",
      body: [
        "Form 1700 is for individuals earning purely compensation income who are not qualified for substituted filing. If you have a salary and also run a business, you have mixed income and file Form 1701, not 1701A. Form 1701 is also the form for self-employed individuals who choose itemized deductions instead of OSD, and for estates and trusts.",
        "Form 1701-MS (August 2024) is the simplified annual return for individuals classified as micro or small taxpayers. Your instructor's table lists both 1701A and 1701-MS; BIR issuances in 2026 (RMC 37-2026 amending RMC 20-2026) set the manner of filing for 1701-MS, 1701 and 1701A. The scanned circular is hard to read, so verify with the latest BIR announcement which form your taxpayer must use. In this lab, a case tells you the form's name only after you have read the facts: reading the story is part of the exercise.",
        "Quick rule: only business/profession income → 1701A (OSD or 8%). Salary plus business → 1701. Only salary and no substituted filing → 1700. Itemized deductions → 1701.",
      ],
    },
    {
      heading: "3. The two ways to compute: graduated rates with OSD, or 8%",
      body: [
        "Graduated rates with OSD: start with net sales (sales less returns, allowances and discounts), subtract the OSD of 40% of that net sales figure (no receipts needed), add other non-operating income, and apply the graduated table. For taxable years 2023 onwards the table is: 0% up to ₱250,000; 15% of the excess over ₱250,000 up to ₱400,000; ₱22,500 + 20% of the excess over ₱400,000 up to ₱800,000; ₱102,500 + 25% over ₱800,000 up to ₱2,000,000; ₱402,500 + 30% over ₱2,000,000 up to ₱8,000,000; ₱2,202,500 + 35% over ₱8,000,000. For taxable years 2018 to 2022 an older table applies (Table 1 printed on the form), so always check the year.",
        "8% option: the tax is 8% of gross sales/receipts (net of returns and discounts) plus other non-operating income, in excess of ₱250,000. It is available only if gross sales/receipts and other non-operating income do not exceed ₱3,000,000, and it is in lieu of both the graduated tax and the 3% percentage tax. It must be elected in the first quarterly return of the year (the form says those who \"opted at the initial quarter\"); once elected it holds for the whole year. The ₱250,000 reduction applies to PURELY self-employed individuals; mixed-income earners do not get it and use Form 1701.",
        "Which is cheaper? It depends on the numbers. With low margins the 8% rate can cost more than graduated-with-OSD; with high margins the reverse is often true. The worked illustration below shows a real comparison.",
      ],
    },
    {
      heading: "4. Deadline, place of filing and attachments",
      body: [
        "The annual income tax return of an individual is due on or before April 15 following the close of the taxable year (the Code, Sec. 51(B)). Verify: the 1701A PDF on bir.gov.ph does not include a separate Guidelines and Instructions page, so this date comes from the Code and from the form's own reference to a second installment on or before October 15.",
        "Item 23 lets you pay part of the tax late without penalty: a second installment of up to 50% of the Item 20 tax due, paid on or before October 15. Use it only when there is a net tax payable. Where to file: under the Ease of Paying Taxes Act (EOPT, RA 11976) filing and payment are no longer tied to the RDO of registration; verify the current channels (Offline eBIRForms Package, eFPS, authorized agent banks) in the latest BIR issuance. RMC 37-2026 lists 1701A as filed electronically through the eBIRForms Package 7.9.6 or eFPS, with online payment.",
        "Attachments (Item 31 counts them): proof of payment of the quarterly returns, BIR Forms 2307 for creditable tax withheld (used for Items 59 and 60), proof of any foreign tax credit, and, for an amended return, the proof of the original payment. Verify the required attachments against the current BIR instructions.",
      ],
    },
    {
      heading: "5. Penalties for filing or paying late",
      body: [
        "A return filed after the due date carries a surcharge (25% of the amount due, 50% if willful) and interest (12% a year, counted by the day) plus a compromise penalty. For micro and small taxpayers the EOPT law reduces these: 10% surcharge, 6% interest and a compromise penalty reduced by half (verify the current schedule). Penalties are computed on the amount of tax payable (Item 24), never on a refund. Items 25 to 27 hold the surcharge, interest and compromise; Item 28 sums them; Item 29 adds them to the tax payable.",
      ],
    },
  ],
  worked: {
    intro: "Maria runs a small bakery in Cabanatuan City (single proprietor). For 2025 her sales were ₱1,200,000 with ₱20,000 returns and discounts, and she earned ₱12,000 commission from a supplier. Her quarterly payments and creditable tax withheld for the year totalled ₱40,000. She files on time.",
    steps: [
      "Option 1, graduated with OSD: net sales ₱1,200,000 − ₱20,000 = ₱1,180,000 (Item 38). OSD 40% = ₱472,000 (Item 39). Net income = ₱708,000 (Item 40). Other income ₱12,000 (Item 41). Taxable income = ₱720,000 (Item 45).",
      "Tax: ₱22,500 + 20% × (₱720,000 − ₱400,000) = ₱22,500 + ₱64,000 = ₱86,500 (Item 46). Less credits ₱40,000 = ₱46,500 payable.",
      "Option 2, 8%: net receipts ₱1,180,000 (Item 49) + other income ₱12,000 (Item 52) = ₱1,192,000 (Item 53). Less ₱250,000 (Item 54) = ₱942,000 (Item 55). Tax = 8% × ₱942,000 = ₱75,360 (Item 56). Less credits ₱40,000 = ₱35,360 payable.",
      "At these numbers the 8% rate saves ₱11,140. If she chose 8% in her first quarter, she fills Part IV.B (Items 47 to 56) and leaves IV.A empty; she must also put ATC II015 (business income, 8%) in Item 7 and tick the 8% box in Item 19.",
    ],
    graduated: { "36": "1,200,000", "37": "20,000", "38": "1,180,000", "39": "472,000", "40": "708,000", "41": "12,000", "45": "720,000", "46": "86,500", "64": "40,000", "65": "46,500" },
    eight: { "47": "1,200,000", "48": "20,000", "49": "1,180,000", "50": "12,000", "53": "1,192,000", "54": "250,000", "55": "942,000", "56": "75,360", "64": "40,000", "65": "35,360" },
  },
  legal: [
    "NIRC (RA 8424) Sec. 24(A)(2)(a): graduated income tax rates of individuals engaged in business or practice of profession, as amended by RA 10963 (TRAIN) from January 1, 2018 and the 2023 table.",
    "NIRC Sec. 24(A)(2)(b)-(c): the 8% income tax option in lieu of the graduated rates and the percentage tax (Sec. 116) for individuals with gross sales/receipts not above ₱3,000,000; ₱250,000 reduction for purely self-employed individuals.",
    "NIRC Sec. 34(L): Optional Standard Deduction of 40% for individuals.",
    "NIRC Sec. 51(B) and Sec. 56: time of filing and payment of the annual return, and payment in two installments; Secs. 248-249: surcharge and interest; RA 11976 (EOPT): reduced penalties for micro and small taxpayers and filing/payment anywhere.",
    "RR 8-2018 (implementing the TRAIN income tax provisions on the 8% option and OSD); RMC 122-2023 (updated 2023 income tax rates on BIR forms, including 1701A); RMC 23-2024 (1701A in eFPS); RMC 37-2026 (filing of 1701-MS, 1701 and 1701A in the Offline eBIRForms Package 7.9.6).",
    `Rules in this lab are as of ${AS_OF} (see the rules file for the unverified items).`,
  ],
};

export const GUIDE: GuideRow[] = [
  { item: "1", field: "1", enter: "The month and year the taxable year ends, as MM/YYYY (12/2025 for the calendar year 2025).", source: "Your books; the year the return covers.", mistake: "Writing the filing year instead of the year of income." },
  { item: "2", field: "2", enter: "Yes only if you are changing a return already filed for the same year.", source: "Your file copy of the earlier return.", mistake: "Ticking Yes for a late original return. Late is not amended." },
  { item: "3", field: "3", enter: "Yes only if the taxable year is shorter than 12 months (started or stopped mid-year).", source: "Certificate of Registration (COR) start date.", mistake: "Using Yes because the business started this year. Only a non-calendar short year is a short period." },
  { item: "4", field: "4", enter: "TIN in 3-3-3-5 digits. Individuals' branch code is 00000.", source: "COR or TIN card.", mistake: "Leaving out the branch code zeros." },
  { item: "5", field: "5", enter: "The 3-digit RDO code where you are registered.", source: "COR.", mistake: "Using the RDO where you file instead of where you are registered." },
  { item: "6", field: "6", enter: "Single Proprietor if you run a business; Professional if you practice a profession.", source: "COR line of business.", mistake: "Choosing Professional for a store owner (this decides the ATC)." },
  { item: "7", field: "7", enter: "II012 business/graduated, II014 profession/graduated, II015 business/8%, II017 profession/8%.", source: "Items 6 and 19 together.", mistake: "An ATC that does not match Items 6 and 19: the Validate button will stop you." },
  { item: "8", field: "8", enter: "Last name, first name, middle name in CAPITAL LETTERS.", source: "COR.", mistake: "Using a nickname or a trade name." },
  { item: "9 and 9A", field: "9", enter: "The registered address and its ZIP code.", source: "COR.", mistake: "Entering the current address when it differs: update the registered address with BIR Form 1905." },
  { item: "10", field: "10", enter: "Date of birth as MM/DD/YYYY.", source: "Birth certificate or valid ID.", mistake: "Using DD/MM/YYYY." },
  { item: "11 to 15", field: "11", enter: "Email, citizenship, foreign tax credit answer and number, contact number.", source: "Taxpayer.", mistake: "Answering Yes to foreign tax credits and leaving Item 14 blank." },
  { item: "16 to 18", field: "16", enter: "Civil status; if married, whether the spouse has income; filing status.", source: "Taxpayer.", mistake: "Choosing Joint Filing without filling Part V." },
  { item: "19", field: "19", enter: "Graduated rates with OSD, or 8%. Match the choice you made in the first quarter.", source: "Your first 1701Q of the year.", mistake: "Switching to 8% at year-end because it looks cheaper." },
  { item: "36 / 47", field: "36A", enter: "Total sales, revenues, receipts or fees for the year. (36 for graduated; 47 for 8%.)", source: "Sales journal, official receipts and invoices issued.", mistake: "Entering net-of-VAT or after-discount figures here." },
  { item: "37 / 48", field: "37A", enter: "Sales returns, allowances and discounts for the year.", source: "Credit memos and discounts given.", mistake: "Putting expenses here." },
  { item: "38 / 49", field: "38A", enter: "Computed: Item 36 less Item 37 (or 47 less 48).", source: "Computed by the form.", mistake: "Overwriting it by hand." },
  { item: "39", field: "39A", enter: "Computed: OSD at 40% of Item 38.", source: "Computed by the form.", mistake: "Applying 40% to sales before returns." },
  { item: "40", field: "40A", enter: "Computed: Item 38 less Item 39.", source: "Computed by the form.", mistake: "Subtracting actual expenses too (no double deduction with OSD)." },
  { item: "41 and 42", field: "41A", enter: "Other non-operating income that is not subject to final tax, and its description.", source: "Official receipts for the income, scrap sales, commissions.", mistake: "Including bank interest or dividends already taxed by final tax." },
  { item: "43", field: "43A", enter: "Share in income of a general professional partnership, if any.", source: "The GPP's Form 2307/ partnership statement.", mistake: "Leaving it out when a partner." },
  { item: "44 and 45", field: "45A", enter: "Computed: Total other income, then total taxable income (Item 40 plus Item 44).", source: "Computed by the form.", mistake: "Using Item 40 alone and forgetting other income." },
  { item: "46", field: "46A", enter: "Computed: tax from the table for the taxable year.", source: "Table 2 for 2023 onwards, Table 1 for 2018-2022.", mistake: "Using the wrong year's table." },
  { item: "50 and 51", field: "50A", enter: "Other non-operating income (8% path), and its description.", source: "Official receipts.", mistake: "Putting other income in Item 47." },
  { item: "52 and 53", field: "53A", enter: "Computed: total other income, then total taxable income before the reduction.", source: "Computed by the form.", mistake: "Using the 8% option when Item 53 is above ₱3,000,000." },
  { item: "54", field: "54A", enter: "Computed: the ₱250,000 reduction for purely self-employed individuals.", source: "Computed by the form.", mistake: "Claiming it as a mixed-income earner." },
  { item: "55 and 56", field: "56A", enter: "Computed: taxable income, then 8% of it.", source: "Computed by the form.", mistake: "Computing 8% of the gross, before the ₱250,000 reduction." },
  { item: "57", field: "57A", enter: "Excess credits carried over from last year's return.", source: "Last year's 1701A Item 24 or 30 'carry over'.", mistake: "Claiming a refund and a carry-over for the same amount." },
  { item: "58", field: "58A", enter: "Income tax paid with the first three quarterly returns (1701Q).", source: "Filed 1701Qs and payment proofs.", mistake: "Forgetting a quarter or counting the annual payment here." },
  { item: "59 and 60", field: "59A", enter: "Creditable tax withheld per Forms 2307: first three quarters (59), fourth quarter (60).", source: "Forms 2307 you hold.", mistake: "Claiming the same 2307 twice (once in 1701Q, once here)." },
  { item: "61", field: "61A", enter: "Tax paid in the return previously filed, if this is an amended return.", source: "The original return's payment.", mistake: "Leaving it blank on an amended return." },
  { item: "62 and 63", field: "62A", enter: "Foreign tax credits; other credits with a description.", source: "Proof of foreign tax paid.", mistake: "No supporting proof attached." },
  { item: "64 and 65", field: "65A", enter: "Computed: total credits, then net tax payable or overpayment.", source: "Computed by the form.", mistake: "Ignoring a negative (overpayment) result." },
  { item: "20 to 22", field: "20A", enter: "Computed: tax due, total credits, net tax payable (all from Part IV).", source: "Computed by the form.", mistake: "Typing them instead of letting Part IV feed them." },
  { item: "23", field: "23A", enter: "Part of the payable you will pay on or before October 15 (up to 50% of Item 20).", source: "Your choice, when there is a tax payable.", mistake: "Using it on an overpayment, or more than 50%." },
  { item: "24", field: "24A", enter: "Computed: Item 22 less Item 23.", source: "Computed by the form.", mistake: "Paying Item 22 when you chose an installment." },
  { item: "25 to 28", field: "25A", enter: "Surcharge, interest and compromise for late filing (25 and 26 are computed from the filing date; 27 is typed).", source: "Filing date and RDO assessment.", mistake: "Adding penalties on an on-time return." },
  { item: "29 and 30", field: "29A", enter: "Computed: total amount payable, and the aggregate of both columns.", source: "Computed by the form.", mistake: "Paying Item 24 only on a late return." },
  { item: "31", field: "31", enter: "How many attachments you are submitting.", source: "Your attachment list.", mistake: "Leaving it blank. Write 0 if none." },
  { item: "32 to 35", field: "32", enter: "Payment details: bank, number, date, amount.", source: "Validated payment slip or e-payment confirmation.", mistake: "Mixing cash and check lines." },
  { item: "66 to 75", field: "66", enter: "The spouse's background information, only when filing jointly.", source: "Spouse's COR.", mistake: "Filing jointly without both spouses' TIN." },
];

export const TIPS = {
  checklist: [
    "Check the COR: your registered tax types, whether you are VAT or non-VAT (percentage tax), and your RDO.",
    "Confirm your tax rate election from your first quarterly return of the year (graduated with OSD or 8%). The annual return must match it.",
    "Gather the books: sales totals, returns and discounts, other income, quarterly return payments (1701Q), and Forms 2307 for each quarter.",
    "List the Forms 2307 and tick them against your quarterly returns so no certificate is used twice.",
    "Check last year's return for any excess credit to carry over (Item 57).",
    "Know your filing date: if it will be after April 15, expect surcharge and interest, and plan the compromise.",
  ],
  pitfalls: [
    "Wrong form: a salaried person with a side business files 1701, not 1701A.",
    "Wrong ATC: it must agree with Item 6 (type) and Item 19 (rate). Use II015/II017 only for the 8% rate.",
    "Forgetting prior-quarter payments (Item 58) or counting them twice with the withholding credits (Items 59 and 60).",
    "Double-claiming a 2307: a certificate used on the 1701Q cannot be used again as a separate credit on the annual return.",
    "OSD versus itemized mix-up: with OSD you may not also deduct actual expenses. Itemized deductions need Form 1701.",
    "Using the wrong year's rates: the 2018-2022 table (Table 1) is not the 2023-onwards table (Table 2).",
    "Including final-taxed income (bank interest, dividends, royalties taxed at source) in the taxable income.",
    "Entering centavos: 1701A is in whole pesos (49 centavos or less drop, 50 or more round up).",
  ],
  amended: "Tick Yes in Item 2 only when you are correcting a return you already filed for the same taxable year (for example you found more sales, or a 2307 you had not claimed). Fill the form with the corrected figures, put the tax you already paid in the original return in Item 61, and attach the proof of that payment. If the corrected return shows a larger payable, pay the difference with penalties from the original due date. A late original return is not an amended return.",
  noPayment: "A no-payment return is still a return. If the tax due is zero, or the credits cover it, you must still file by April 15 and attach the supporting papers; the amount payable (Item 29) is simply zero. If credits exceed the tax, the overpayment goes to Item 24 as a negative amount and you must mark one box: refund, Tax Credit Certificate, or carry-over. The choice cannot be changed afterwards.",
};

export const QUIZ: QuizItem[] = [
  { q: "Ana earns ₱45,000 a month as an employee and also runs an online shop. Which annual return does she use?", choices: ["Form 1700", "Form 1701A", "Form 1701", "Form 1702-RT"], answer: 2, explain: "She has mixed income (compensation plus business), so she files Form 1701. Form 1701A is only for income purely from business or profession." },
  { q: "A freelance designer, single proprietor, chose the 8% rate at the start of the year. Which ATC goes in Item 7?", choices: ["II012", "II014", "II015", "II017"], answer: 2, explain: "II015 is Business Income at the 8% rate. II012 is business under graduated rates; II014 and II017 are for professionals. A designer running a business is a single proprietor, so II015." },
  { q: "Net sales (Item 38) are ₱1,000,000. What is the Optional Standard Deduction (Item 39)?", choices: ["₱250,000", "₱300,000", "₱400,000", "₱600,000"], answer: 2, explain: "OSD is 40% of Item 38: 40% × ₱1,000,000 = ₱400,000." },
  { q: "On the 8% rate, Item 53 (total taxable income before the reduction) is ₱1,100,000. What is the tax due?", choices: ["₱68,000", "₱88,000", "₱56,000", "₱128,000"], answer: 0, explain: "Subtract the ₱250,000 reduction first: ₱1,100,000 − ₱250,000 = ₱850,000. Then 8%: ₱850,000 × 8% = ₱68,000." },
  { q: "A micro taxpayer files the annual return 40 days late, owing ₱30,000 after credits. Which statement is right?", choices: ["Surcharge is 25% and interest 12% a year", "Surcharge is 10% and interest 6% a year, counted by the day", "No penalty if the credits are large", "Penalties are computed on the tax due, before credits"], answer: 1, explain: "For micro and small taxpayers, EOPT reduces the surcharge to 10% and the interest to 6% a year (by the day over 365). They are computed on the amount of tax payable after credits (Item 24)." },
];
