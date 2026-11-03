// Source documents for Sets A and B, keyed "setId/itemId". Students journalize from these papers.
import { P, type SourceDocument } from "./types";

/** Builds a document; items are [description, pesos] pairs. */
export const doc = (type: string, no: string, date: string, partyLabel: string, party: string, items: [string, number][], extra: { terms?: string; note?: string } = {}): SourceDocument => ({
  type, no, date, partyLabel, party, items: items.map(([desc, pesos]) => ({ desc, amount: P(pesos) })), ...extra,
});

export const DOCS: Record<string, SourceDocument> = {
  // ---- Set A: CleanPro Laundry & Cleaning Services
  "cleanpro/t01": doc("Bank Deposit Slip", "DS-0001", "2026-12-01", "Deposited by", "Ms. Reyes, owner", [["Cash deposited to the business account: the owner's initial investment", 500000]], { note: "CleanPro is a new sole proprietorship. No other assets were invested." }),
  "cleanpro/t02": doc("Sales Invoice", "7781", "2026-12-02", "Sold by", "Wash-Tech Machinery Inc.", [["Industrial washing and drying equipment, delivered and installed", 240000]], { terms: "Down payment ₱100,000 in cash. The balance of ₱140,000 is covered by Promissory Note No. 1 issued by CleanPro.", note: "Received in good order. Use: laundry operations." }),
  "cleanpro/t03": doc("Official Receipt", "OR-5521", "2026-12-03", "Issued by", "Mr. Tan, lessor", [["Advance rent for six months, December 2026 to May 2027, at ₱6,000 a month", 36000]], { note: "Received in cash from CleanPro." }),
  "cleanpro/t04": doc("Sales Invoice", "20871", "2026-12-04", "Sold by", "Linis Supplies Co.", [["Detergents, softener and cleaning supplies", 8000]], { terms: "Payable within 30 days. Goods received." }),
  "cleanpro/t05": doc("Official Receipt (issued)", "OR-0001", "2026-12-07", "Issued to", "Walk-in customers", [["Laundry services, cash", 28000]], { note: "Cash received and deposited." }),
  "cleanpro/t06": doc("Billing Invoice (issued)", "BI-0001", "2026-12-10", "Billed to", "Greenview Condominium", [["Cleaning services, December 8 to 10", 45000]], { terms: "Payable in 30 days." }),
  "cleanpro/t07": doc("Official Receipt (issued)", "OR-0002", "2026-12-12", "Issued to", "Various customers", [["Laundry and cleaning services, cash", 32000]]),
  "cleanpro/t08": doc("Official Receipt (issued)", "OR-0003", "2026-12-14", "Issued to", "Greenview Condominium", [["Payment received on Billing Invoice BI-0001", 20000]]),
  "cleanpro/t09": doc("Utility Bills with Official Receipts", "MC-1204 / MW-0988", "2026-12-15", "Paid to", "Meralco and Maynilad", [["Electricity, November to December", 4000], ["Water, November to December", 2500]], { note: "Both bills paid in cash." }),
  "cleanpro/t10": doc("Check Voucher", "CV-001", "2026-12-17", "Paid to", "Linis Supplies Co.", [["Partial payment of Sales Invoice 20871", 5000]], { note: "Check issued and released." }),
  "cleanpro/t11": doc("Billing Invoice (issued)", "BI-0002", "2026-12-18", "Billed to", "Sunrise Hotel", [["Cleaning services, December 15 to 17", 38000]], { terms: "Payable in 30 days." }),
  "cleanpro/t12": doc("Official Receipt (issued)", "OR-0004", "2026-12-20", "Issued to", "Sunrise Hotel", [["Payment received on Billing Invoice BI-0002", 30000]]),
  "cleanpro/t13": doc("Official Receipt (issued)", "OR-0005", "2026-12-22", "Issued to", "Various customers", [["Laundry services, cash", 26000]]),
  "cleanpro/t14": doc("Check Voucher", "CV-002", "2026-12-23", "Paid to", "Ms. Reyes, owner", [["Personal withdrawal by the owner", 15000]], { note: "Not for any business purpose." }),
  "cleanpro/t15": doc("Official Receipt", "OR-3310", "2026-12-26", "Issued by", "Metro Ad Agency", [["Flyers and radio advertisement, December campaign", 4000]], { note: "Paid in cash." }),
  "cleanpro/t16": doc("Payroll Register", "PR-12A", "2026-12-28", "Paid to", "Employees (3)", [["Salaries for December 1 to 28, paid in cash", 18000]]),
  "cleanpro/t17": doc("Official Receipt (issued)", "OR-0006", "2026-12-29", "Issued to", "Pearl Residences", [["Advance payment for cleaning services to be rendered in January 2027", 12000]], { note: "No services have been rendered yet." }),
  "cleanpro/adj-a": doc("Lease Contract and Rent Ledger", "LC-01", "2026-12-31", "Lessor", "Mr. Tan", [["Rent paid in advance on December 3 for six months", 36000]], { note: "The lease started December 1. As of December 31, one month has passed." }),
  "cleanpro/adj-b": doc("Supplies Count Sheet", "SC-12", "2026-12-31", "Counted by", "Store clerk", [["Supplies on hand per physical count", 2500], ["Supplies available during December (purchase of December 4; none before)", 8000]]),
  "cleanpro/adj-c": doc("Payroll Register", "PR-12B", "2026-12-31", "Prepared for", "Employees (3)", [["Salaries earned December 29 to 31, to be paid in January", 12000]]),
  "cleanpro/adj-d": doc("Fixed Asset Schedule", "FA-01", "2026-12-31", "Asset", "Washing and drying equipment", [["Cost", 240000], ["Estimated salvage value", 24000]], { terms: "Useful life 5 years (60 months), straight-line. Record one month of depreciation." }),
  "cleanpro/adj-e": doc("Receivables Report and Credit Policy", "AR-12", "2026-12-31", "Report", "Accounts receivable per ledger", [["Accounts receivable balance before any unbilled services", 33000]], { terms: "Management estimates that 2% of accounts receivable will not be collected." }),
  "cleanpro/adj-f": doc("Job Completion Report", "JC-12", "2026-12-31", "Customer", "Harbor View Offices", [["Cleaning services completed December 30 to 31, not yet billed", 9000]]),

  // ---- Set B: Metro Hardware & Supplies
  "metro/t01": doc("Bank Deposit Slip and Inventory List", "DS-0001", "2026-12-01", "Invested by", "Mr. Santos, owner", [["Cash deposited to the business account", 550000], ["Merchandise turned over per inventory list, at cost", 50000]]),
  "metro/t02": doc("Sales Invoice", "LT-4410", "2026-12-03", "Sold by", "Lazaro Trading", [["Hardware merchandise", 120000]], { terms: "2/10, n/30. FOB shipping point, freight collect.", note: "Swift Cargo's freight bill of ₱3,000 was paid in cash by Metro Hardware on delivery." }),
  "metro/t03": doc("Sales Invoice", "DC-7021", "2026-12-05", "Sold by", "Dela Cruz Supply", [["Hardware merchandise, freight included in the price", 80000]], { terms: "1/15, n/eom. FOB destination, freight prepaid by the seller." }),
  "metro/t04": doc("Debit Memo", "DM-001", "2026-12-08", "Issued to", "Dela Cruz Supply", [["Return of defective merchandise from Invoice DC-7021", 5000]], { note: "Reduces the amount owed to the supplier." }),
  "metro/t05": doc("Sales Invoice (issued)", "SI-0001", "2026-12-10", "Sold to", "Cruz Builders", [["Hardware merchandise", 150000]], { terms: "2/10, n/30." }),
  "metro/t06": doc("Check Voucher", "CV-001", "2026-12-12", "Paid to", "Lazaro Trading", [["Invoice LT-4410", 120000], ["Less: 2% cash discount (paid within 10 days)", -2400]], { note: "Check issued for the net amount." }),
  "metro/t07": doc("Credit Memo", "CM-001", "2026-12-13", "Issued to", "Cruz Builders", [["Allowance for slightly damaged goods on Invoice SI-0001", 3000]], { note: "Reduces the amount the customer owes." }),
  "metro/t08": doc("Cash Register Summary", "CR-1215", "2026-12-15", "Source", "Store cash register", [["Cash sales for the day", 95000]]),
  "metro/t09": doc("Check Voucher", "CV-002", "2026-12-18", "Paid to", "Dela Cruz Supply", [["Invoice DC-7021", 80000], ["Less: returned goods (Debit Memo DM-001)", -5000], ["Less: 1% discount on the balance of ₱75,000 (paid within 15 days)", -750]], { note: "Check issued for the net amount." }),
  "metro/t10": doc("Official Receipt (issued)", "OR-0001", "2026-12-19", "Issued to", "Cruz Builders", [["Invoice SI-0001", 150000], ["Less: allowance (Credit Memo CM-001)", -3000], ["Less: 2% discount on the balance of ₱147,000 (paid within 10 days)", -2940]], { note: "Cash received for the net amount." }),
  "metro/t11": doc("Cash Sales Invoice (issued)", "SI-0002", "2026-12-20", "Sold to", "Walk-in customer", [["Hardware merchandise, cash", 60000]], { terms: "FOB destination: Metro Hardware pays the delivery." }),
  "metro/t12": doc("Official Receipt", "SC-3302", "2026-12-20", "Issued by", "Swift Cargo", [["Delivery of goods sold on Cash Sales Invoice SI-0002", 1500]], { note: "Paid in cash by Metro Hardware." }),
  "metro/t13": doc("Official Receipt", "OR-2210", "2026-12-22", "Issued by", "Lessor of the store", [["Store rent for December 2026", 18000]], { note: "Paid in cash." }),
  "metro/t14": doc("Payroll Register", "PR-12", "2026-12-26", "Paid to", "Employees", [["Salaries for December 1 to 26, paid in cash", 25000]]),
  "metro/t15": doc("Utility Bills with Official Receipts", "MC-5521 / MW-3310", "2026-12-28", "Paid to", "Meralco and Maynilad", [["Electricity", 3800], ["Water", 1700]], { note: "Both paid in cash." }),
  "metro/t16": doc("Check Voucher", "CV-003", "2026-12-29", "Paid to", "Mr. Santos, owner", [["Personal withdrawal by the owner", 20000]]),
  "metro/adj-a": doc("Payroll Register", "PR-12B", "2026-12-31", "Prepared for", "Employees", [["Salaries earned December 27 to 31, to be paid in January", 5000]]),
};
