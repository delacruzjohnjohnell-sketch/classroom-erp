// Practice Set A: CleanPro Laundry & Cleaning Services, a sole proprietorship (service business), December 2026.
import { cr, dr } from "../core/journalizer";
import { P, type PracticeSet } from "./types";

export const CLEANPRO: PracticeSet = {
  id: "cleanpro",
  title: "Set A: CleanPro Laundry & Cleaning Services",
  business: "service",
  entity: "CleanPro Laundry & Cleaning Services",
  period: "For the month ended December 31, 2026",
  asOf: "December 31, 2026",
  closingDate: "2026-12-31",
  reversingDate: "2027-01-01",
  summary: "A one-owner laundry and cleaning service. Journalize 17 transactions, then make six adjustments: prepaid rent (asset method), supplies, accrued salaries, straight-line depreciation with salvage value, uncollectible accounts and unbilled revenue.",
  transactions: [
    { id: "t01", date: "2026-12-01", kind: "general", description: "The owner, Ms. Reyes, started the business by investing ₱500,000 cash.", key: [dr("101", P(500000)), cr("301", P(500000))], hint: "An investment by the owner increases an asset (Cash) and Owner's Capital." },
    { id: "t02", date: "2026-12-02", kind: "general", description: "Bought laundry equipment for ₱240,000: ₱100,000 in cash and the balance by a promissory note.", key: [dr("160", P(240000)), cr("101", P(100000)), cr("202", P(140000))], hint: "A compound entry: one debit for the full cost, two credits for how it was paid. The equipment is recorded in 160 Office Equipment." },
    { id: "t03", date: "2026-12-03", kind: "cash-disbursements", description: "Paid ₱36,000 rent in advance for six months, starting December 1.", key: [dr("140", P(36000)), cr("101", P(36000))], hint: "Use the ASSET method: debit Prepaid Rent (an asset), not Rent Expense. The expense is recorded when the month is used up, at adjustment." },
    { id: "t04", date: "2026-12-04", kind: "general", description: "Bought cleaning supplies on account for ₱8,000.", key: [dr("150", P(8000)), cr("201", P(8000))], hint: "Supplies are an asset until they are used. Debit Office Supplies; the unpaid amount is Accounts Payable." },
    { id: "t05", date: "2026-12-07", kind: "cash-receipts", description: "Received ₱28,000 cash for laundry services rendered.", key: [dr("101", P(28000)), cr("401", P(28000))] },
    { id: "t06", date: "2026-12-10", kind: "general", description: "Performed cleaning services on account for ₱45,000.", key: [dr("110", P(45000)), cr("401", P(45000))], hint: "Revenue is recorded when earned, even if the customer has not paid yet. Debit Accounts Receivable." },
    { id: "t07", date: "2026-12-12", kind: "cash-receipts", description: "Received ₱32,000 cash for services rendered.", key: [dr("101", P(32000)), cr("401", P(32000))] },
    { id: "t08", date: "2026-12-14", kind: "cash-receipts", description: "Collected ₱20,000 from customers on account.", key: [dr("101", P(20000)), cr("110", P(20000))], hint: "A collection on account does not create new revenue; it exchanges one asset (receivable) for another (cash)." },
    { id: "t09", date: "2026-12-15", kind: "cash-disbursements", description: "Paid ₱6,500 for electricity and water.", key: [dr("603", P(6500)), cr("101", P(6500))] },
    { id: "t10", date: "2026-12-17", kind: "cash-disbursements", description: "Paid ₱5,000 to the supplier on account.", key: [dr("201", P(5000)), cr("101", P(5000))] },
    { id: "t11", date: "2026-12-18", kind: "general", description: "Performed cleaning services on account for ₱38,000.", key: [dr("110", P(38000)), cr("401", P(38000))] },
    { id: "t12", date: "2026-12-20", kind: "cash-receipts", description: "Collected ₱30,000 from customers on account.", key: [dr("101", P(30000)), cr("110", P(30000))] },
    { id: "t13", date: "2026-12-22", kind: "cash-receipts", description: "Received ₱26,000 cash for services rendered.", key: [dr("101", P(26000)), cr("401", P(26000))] },
    { id: "t14", date: "2026-12-23", kind: "cash-disbursements", description: "The owner withdrew ₱15,000 for personal use.", key: [dr("302", P(15000)), cr("101", P(15000))], hint: "Withdrawals are not an expense. Debit Owner's Drawing, a temporary account closed to Capital at year-end." },
    { id: "t15", date: "2026-12-26", kind: "cash-disbursements", description: "Paid ₱4,000 for advertising.", key: [dr("608", P(4000)), cr("101", P(4000))] },
    { id: "t16", date: "2026-12-28", kind: "cash-disbursements", description: "Paid ₱18,000 salaries to employees.", key: [dr("601", P(18000)), cr("101", P(18000))] },
    { id: "t17", date: "2026-12-29", kind: "cash-receipts", description: "Received ₱12,000 in advance from a customer for services to be rendered next month.", key: [dr("101", P(12000)), cr("230", P(12000))], hint: "Cash received before the service is rendered is a liability: Unearned Service Revenues. Nothing has been earned yet." },
  ],
  adjustments: [
    { tag: "a", date: "2026-12-31", adjType: "prepaid-asset", description: "One month of the prepaid rent (₱36,000 ÷ 6) has expired.", key: [dr("602", P(6000)), cr("140", P(6000))], hint: "The rent was debited to Prepaid Rent (asset method), so the adjustment moves the used month to Rent Expense: Dr Rent Expense, Cr Prepaid Rent. Unexpired rent left: ₱30,000." },
    { tag: "b", date: "2026-12-31", adjType: "supplies", description: "A count shows ₱2,500 of supplies on hand.", key: [dr("604", P(5500)), cr("150", P(5500))], hint: "Supplies used = ₱8,000 available − ₱2,500 on hand = ₱5,500. Expense the amount used, not the amount left." },
    { tag: "c", date: "2026-12-31", adjType: "accrued-expense", description: "Salaries earned by employees but unpaid at month-end amount to ₱12,000.", key: [dr("601", P(12000)), cr("210", P(12000))], hint: "An accrued expense: Dr Salaries and Wages Expense, Cr Salaries and Wages Payable (a liability)." },
    { tag: "d", date: "2026-12-31", adjType: "depreciation", description: "Depreciate the equipment, straight-line: five-year life, ₱24,000 salvage value. Record one month.", key: [dr("605", P(3600)), cr("160-A", P(3600))], hint: "(₱240,000 − ₱24,000) ÷ 60 months = ₱3,600. Credit Accumulated Depreciation (160-A), a contra-asset, never the equipment account itself." },
    { tag: "e", date: "2026-12-31", adjType: "uncollectible", description: "Estimate uncollectible accounts at 2% of the ₱33,000 accounts receivable.", key: [dr("607", P(660)), cr("110-A", P(660))], hint: "₱33,000 × 2% = ₱660. Credit Allowance for Uncollectible Accounts (a contra-asset), not Accounts Receivable." },
    { tag: "f", date: "2026-12-31", adjType: "accrued-revenue", description: "Services of ₱9,000 were performed for a customer but not yet billed.", key: [dr("110", P(9000)), cr("401", P(9000))], hint: "Accrued (unbilled) revenue: Dr Accounts Receivable, Cr Service Revenues." },
  ],
  expected: { netIncome: P(121740), totalAssets: P(773740), endingCapital: P(606740) },
};
