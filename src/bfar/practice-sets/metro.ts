// Practice Set B: Metro Hardware & Supplies, a sole proprietorship (merchandising business, periodic inventory system), December 2026.
import { doc } from "./documents";
import type { PracticeSet } from "./types";

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
  endingInventory: 6500000,
  periodEndDocuments: [doc("Physical Inventory Count Sheet", "IC-12", "2026-12-31", "Counted by", "Store manager and owner", [["Merchandise on hand at December 31, at cost", 65000]], { note: "Used under the periodic inventory system to find the cost of goods sold." })],
  transactions: [
    { id: "t01", date: "2026-12-01", kind: "general", description: "Mr. Santos started the business by investing ₱550,000 cash and merchandise worth ₱50,000." },
    { id: "t02", date: "2026-12-03", kind: "purchases", description: "Purchased merchandise on account from Lazaro Trading for ₱120,000. The buyer paid ₱3,000 freight in cash to the carrier.", terms: "2/10, n/30; FOB shipping point, freight collect" },
    { id: "t03", date: "2026-12-05", kind: "purchases", description: "Purchased merchandise on account from Dela Cruz Supply for ₱80,000. The seller prepaid the freight and included it in the invoice price.", terms: "1/15, n/eom; FOB destination, freight prepaid" },
    { id: "t04", date: "2026-12-08", kind: "purchases", description: "Returned defective merchandise worth ₱5,000 to Dela Cruz Supply (debit memo issued)." },
    { id: "t05", date: "2026-12-10", kind: "sales", description: "Sold merchandise on account to Cruz Builders for ₱150,000.", terms: "2/10, n/30" },
    { id: "t06", date: "2026-12-12", kind: "cash-disbursements", description: "Paid Lazaro Trading within the discount period (2% of ₱120,000)." },
    { id: "t07", date: "2026-12-13", kind: "sales", description: "Granted Cruz Builders a ₱3,000 allowance for slightly damaged goods (credit memo issued)." },
    { id: "t08", date: "2026-12-15", kind: "cash-receipts", description: "Cash sales for the day totaled ₱95,000." },
    { id: "t09", date: "2026-12-18", kind: "cash-disbursements", description: "Paid Dela Cruz Supply within the discount period for the net purchase (₱80,000 − ₱5,000 return = ₱75,000, less 1%)." },
    { id: "t10", date: "2026-12-19", kind: "cash-receipts", description: "Cruz Builders paid within the discount period. The 2% discount applies to the ₱147,000 balance (₱150,000 − ₱3,000 allowance)." },
    { id: "t11", date: "2026-12-20", kind: "cash-receipts", description: "Sold merchandise for cash, ₱60,000. FOB destination: the store paid ₱1,500 freight to deliver it (recorded separately in the next entry)." },
    { id: "t12", date: "2026-12-20", kind: "cash-disbursements", description: "Paid ₱1,500 delivery freight on the ₱60,000 cash sale." },
    { id: "t13", date: "2026-12-22", kind: "cash-disbursements", description: "Paid store rent for December, ₱18,000." },
    { id: "t14", date: "2026-12-26", kind: "cash-disbursements", description: "Paid salaries, ₱25,000." },
    { id: "t15", date: "2026-12-28", kind: "cash-disbursements", description: "Paid electricity and water, ₱5,500." },
    { id: "t16", date: "2026-12-29", kind: "cash-disbursements", description: "The owner withdrew ₱20,000 for personal use." },
  ],
  adjustments: [
    { tag: "a", date: "2026-12-31", adjType: "accrued-expense", description: "Salaries earned but unpaid at month-end amount to ₱5,000." },
  ],
};
