// Shared types for the BFAR (Basic Financial Accounting and Reporting) module. Money is always integer centavos; dates are ISO "YYYY-MM-DD".
import type { Centavos } from "../lib/currency";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type NormalBalance = "debit" | "credit";
/** Where an account lands on the statements. */
export type Section =
  | "current-asset" | "noncurrent-asset"
  | "current-liability" | "noncurrent-liability"
  | "equity" | "temporary-equity"
  | "revenue" | "contra-revenue"
  | "purchases" | "contra-purchases"
  | "operating-expense";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  normal: NormalBalance;
  contra: boolean;
  section: Section;
  /** "service" and "merchandising" accounts only appear in that business type; "both" in either. */
  business: "service" | "merchandising" | "both";
  /** Which accounts a contra account offsets, e.g. "160" for 160-A. */
  offsets?: string;
}

export interface JournalLine { accountCode: string; debit: Centavos; credit: Centavos }

export type JournalKind = "general" | "sales" | "purchases" | "cash-receipts" | "cash-disbursements";

export interface JournalEntry {
  id: string;
  date: string;
  kind: JournalKind;
  lines: JournalLine[];
  explanation: string;
  /** "adjusting", "closing" and "reversing" entries are kept apart from the transaction journal. */
  stage: "transaction" | "adjusting" | "closing" | "reversing";
  /** The letter on an adjusting entry, e.g. "a". */
  tag?: string;
  /** What kind of adjustment an adjusting entry is; the reversing engine reads it. */
  adjType?: AdjustmentType;
}

export type AdjustmentType =
  | "accrued-expense" | "accrued-revenue"
  | "prepaid-asset" | "prepaid-expense"
  | "unearned-liability" | "unearned-income"
  | "depreciation" | "uncollectible" | "supplies";

export interface LedgerRow { date: string; explanation: string; ref: string; debit: Centavos; credit: Centavos; balance: Centavos; side: NormalBalance }
export interface LedgerAccount { account: Account; rows: LedgerRow[]; debitTotal: Centavos; creditTotal: Centavos; balance: Centavos; balanceSide: NormalBalance }

export interface TrialBalanceRow { code: string; name: string; debit: Centavos; credit: Centavos }
export interface TrialBalance { rows: TrialBalanceRow[]; totalDebit: Centavos; totalCredit: Centavos; balanced: boolean }

export type BusinessType = "service" | "merchandising";
export type InventorySystem = "periodic" | "perpetual";
