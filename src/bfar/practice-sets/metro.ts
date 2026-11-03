// Practice Set B: Metro Hardware & Supplies, a sole proprietorship (merchandising business, periodic inventory system), December 2026.
import { cr, dr } from "../core/journalizer";
import { P, type PracticeSet } from "./types";

export const METRO: PracticeSet = {
  id: "metro",
  title: "Set B: Metro Hardware & Supplies",
  business: "merchandising",
  inventory: "periodic",
  entity: "Metro Hardware & Supplies",
  period: "For the month ended December 31, 2026",
  asOf: "December 31, 2026",
  closingDate: "2026-12-31",
  reversingDate: "2027-01-01",
  summary: "A hardware store using the periodic system. Credit terms (2/10, n/30 and 1/15, n/eom), FOB shipping point with freight collect and FOB destination with freight prepaid, returns and allowances, discounts, then a physical count to find the cost of goods sold.",
  endingInventory: P(65000),
  transactions: [
    { id: "t01", date: "2026-12-01", kind: "general", description: "Mr. Santos started the business by investing ₱550,000 cash and merchandise worth ₱50,000.", key: [dr("101", P(550000)), dr("130", P(50000)), cr("301", P(600000))], hint: "Beginning merchandise is recorded in Merchandise Inventory (130). Under the periodic system, no other entry touches it until the physical count." },
    { id: "t02", date: "2026-12-03", kind: "purchases", description: "Purchased merchandise on account from Lazaro Trading for ₱120,000. The buyer paid ₱3,000 freight in cash to the carrier.", terms: "2/10, n/30; FOB shipping point, freight collect", key: [dr("501", P(120000)), dr("504", P(3000)), cr("201", P(120000)), cr("101", P(3000))], hint: "FOB shipping point: the buyer owns the goods in transit and pays the freight, so debit Freight-In (504), not Freight-Out. Purchases are recorded at the gross invoice amount." },
    { id: "t03", date: "2026-12-05", kind: "purchases", description: "Purchased merchandise on account from Dela Cruz Supply for ₱80,000. The seller prepaid the freight and included it in the invoice price.", terms: "1/15, n/eom; FOB destination, freight prepaid", key: [dr("501", P(80000)), cr("201", P(80000))], hint: "FOB destination: the seller owns the goods until delivery and bears the freight. The buyer records no freight." },
    { id: "t04", date: "2026-12-08", kind: "purchases", description: "Returned defective merchandise worth ₱5,000 to Dela Cruz Supply (debit memo issued).", key: [dr("201", P(5000)), cr("502", P(5000))], hint: "Credit Purchase Returns and Allowances (502), a contra-purchases account, and reduce Accounts Payable." },
    { id: "t05", date: "2026-12-10", kind: "sales", description: "Sold merchandise on account to Cruz Builders for ₱150,000.", terms: "2/10, n/30", key: [dr("110", P(150000)), cr("420", P(150000))], hint: "Under the periodic system a sale credits Gross Sales only; no cost of goods sold entry is made." },
    { id: "t06", date: "2026-12-12", kind: "cash-disbursements", description: "Paid Lazaro Trading within the discount period (2% of ₱120,000).", key: [dr("201", P(120000)), cr("101", P(117600)), cr("503", P(2400))], hint: "The discount (2% × ₱120,000 = ₱2,400) is credited to Purchase Discounts (503); cash paid is ₱117,600." },
    { id: "t07", date: "2026-12-13", kind: "sales", description: "Granted Cruz Builders a ₱3,000 allowance for slightly damaged goods (credit memo issued).", key: [dr("421", P(3000)), cr("110", P(3000))], hint: "Debit Sales Returns and Allowances (421), a contra-revenue, and reduce Accounts Receivable." },
    { id: "t08", date: "2026-12-15", kind: "cash-receipts", description: "Cash sales for the day totaled ₱95,000.", key: [dr("101", P(95000)), cr("420", P(95000))] },
    { id: "t09", date: "2026-12-18", kind: "cash-disbursements", description: "Paid Dela Cruz Supply within the discount period for the net purchase (₱80,000 − ₱5,000 return = ₱75,000, less 1%).", key: [dr("201", P(75000)), cr("101", P(74250)), cr("503", P(750))], hint: "The discount applies to what is still owed after the return: 1% × ₱75,000 = ₱750." },
    { id: "t10", date: "2026-12-19", kind: "cash-receipts", description: "Cruz Builders paid within the discount period. The 2% discount applies to the ₱147,000 balance (₱150,000 − ₱3,000 allowance).", key: [dr("101", P(144060)), dr("422", P(2940)), cr("110", P(147000))], hint: "Debit Sales Discounts (422) for 2% × ₱147,000 = ₱2,940. Accounts Receivable is credited for the full ₱147,000." },
    { id: "t11", date: "2026-12-20", kind: "cash-receipts", description: "Sold merchandise for cash, ₱60,000. FOB destination: the store paid ₱1,500 freight to deliver it (recorded separately in the next entry).", key: [dr("101", P(60000)), cr("420", P(60000))] },
    { id: "t12", date: "2026-12-20", kind: "cash-disbursements", description: "Paid ₱1,500 delivery freight on the ₱60,000 cash sale.", key: [dr("609", P(1500)), cr("101", P(1500))], hint: "Freight paid by the seller to deliver goods is Freight-Out (609), an operating expense. Do not confuse it with Freight-In." },
    { id: "t13", date: "2026-12-22", kind: "cash-disbursements", description: "Paid store rent for December, ₱18,000.", key: [dr("602", P(18000)), cr("101", P(18000))] },
    { id: "t14", date: "2026-12-26", kind: "cash-disbursements", description: "Paid salaries, ₱25,000.", key: [dr("601", P(25000)), cr("101", P(25000))] },
    { id: "t15", date: "2026-12-28", kind: "cash-disbursements", description: "Paid electricity and water, ₱5,500.", key: [dr("603", P(5500)), cr("101", P(5500))] },
    { id: "t16", date: "2026-12-29", kind: "cash-disbursements", description: "The owner withdrew ₱20,000 for personal use.", key: [dr("302", P(20000)), cr("101", P(20000))] },
  ],
  adjustments: [
    { tag: "a", date: "2026-12-31", adjType: "accrued-expense", description: "Salaries earned but unpaid at month-end amount to ₱5,000.", key: [dr("601", P(5000)), cr("210", P(5000))], hint: "Dr Salaries and Wages Expense, Cr Salaries and Wages Payable." },
  ],
  expected: { netIncome: P(64210), totalAssets: P(649210), endingCapital: P(644210), costOfGoodsSold: P(179850) },
};
