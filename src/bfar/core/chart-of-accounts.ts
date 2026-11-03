// Ballada's three-digit chart of accounts for a sole proprietorship. 505 Cost of Goods Sold is added for the perpetual-inventory practice only.
import type { Account, AccountType, Section } from "./types";

const a = (code: string, name: string, type: AccountType, section: Section, extra: Partial<Account> = {}): Account => ({
  code, name, type, section, normal: type === "asset" || type === "expense" ? "debit" : "credit", contra: false, business: "both", ...extra,
});
const contra = (code: string, name: string, type: AccountType, section: Section, offsets: string, extra: Partial<Account> = {}): Account => {
  const base = a(code, name, type, section, extra);
  return { ...base, contra: true, offsets, normal: base.normal === "debit" ? "credit" : "debit" };
};

export const CHART_OF_ACCOUNTS: Account[] = [
  a("101", "Cash", "asset", "current-asset"),
  a("102", "Petty Cash", "asset", "current-asset"),
  a("110", "Accounts Receivable", "asset", "current-asset"),
  contra("110-A", "Allowance for Uncollectible Accounts", "asset", "current-asset", "110"),
  a("120", "Notes Receivable", "asset", "current-asset"),
  a("130", "Merchandise Inventory", "asset", "current-asset", { business: "merchandising" }),
  a("140", "Prepaid Rent", "asset", "current-asset"),
  a("141", "Prepaid Insurance", "asset", "current-asset"),
  a("150", "Office Supplies", "asset", "current-asset"),
  a("151", "Store Supplies", "asset", "current-asset"),
  a("160", "Office Equipment", "asset", "noncurrent-asset"),
  contra("160-A", "Accumulated Depreciation – Office Equipment", "asset", "noncurrent-asset", "160"),
  a("170", "Delivery Equipment", "asset", "noncurrent-asset"),
  contra("170-A", "Accumulated Depreciation – Delivery Equipment", "asset", "noncurrent-asset", "170"),

  a("201", "Accounts Payable", "liability", "current-liability"),
  a("202", "Notes Payable", "liability", "current-liability"),
  a("210", "Salaries and Wages Payable", "liability", "current-liability"),
  a("220", "Interest Payable", "liability", "current-liability"),
  a("230", "Unearned Service Revenues", "liability", "current-liability"),

  a("301", "Owner's Capital", "equity", "equity"),
  a("302", "Owner's Drawing", "equity", "temporary-equity", { normal: "debit" }),
  a("303", "Income Summary", "equity", "temporary-equity"),

  a("401", "Service Revenues", "revenue", "revenue"),
  a("410", "Professional Fees", "revenue", "revenue", { business: "service" }),
  a("420", "Gross Sales", "revenue", "revenue", { business: "merchandising" }),
  contra("421", "Sales Returns and Allowances", "revenue", "contra-revenue", "420", { business: "merchandising" }),
  contra("422", "Sales Discounts", "revenue", "contra-revenue", "420", { business: "merchandising" }),

  a("501", "Purchases", "expense", "purchases", { business: "merchandising" }),
  contra("502", "Purchase Returns and Allowances", "expense", "contra-purchases", "501", { business: "merchandising" }),
  contra("503", "Purchase Discounts", "expense", "contra-purchases", "501", { business: "merchandising" }),
  a("504", "Freight-In", "expense", "purchases", { business: "merchandising" }),
  a("505", "Cost of Goods Sold", "expense", "purchases", { business: "merchandising" }),

  a("601", "Salaries and Wages Expense", "expense", "operating-expense"),
  a("602", "Rent Expense", "expense", "operating-expense"),
  a("603", "Utilities Expense", "expense", "operating-expense"),
  a("604", "Supplies Expense", "expense", "operating-expense"),
  a("605", "Depreciation Expense – Office Equipment", "expense", "operating-expense"),
  a("606", "Depreciation Expense – Delivery Equipment", "expense", "operating-expense"),
  a("607", "Uncollectible Accounts Expense", "expense", "operating-expense"),
  a("608", "Advertising Expense", "expense", "operating-expense"),
  a("609", "Freight-Out", "expense", "operating-expense", { business: "merchandising" }),
  a("610", "Insurance Expense", "expense", "operating-expense"),
  a("611", "Miscellaneous Expense", "expense", "operating-expense"),
  a("612", "Interest Expense", "expense", "operating-expense"),
];

const BY_CODE = new Map(CHART_OF_ACCOUNTS.map((x) => [x.code, x]));

export const getAccount = (code: string): Account | undefined => BY_CODE.get(code.trim().toUpperCase());

export function requireAccount(code: string): Account {
  const acc = getAccount(code);
  if (!acc) throw new Error(`Unknown account code ${code}`);
  return acc;
}

/** Autocomplete: matches the code prefix or any part of the name, codes first. */
export function searchAccounts(query: string, limit = 8): Account[] {
  const q = query.trim().toLowerCase();
  if (!q) return CHART_OF_ACCOUNTS.slice(0, limit);
  const byCode = CHART_OF_ACCOUNTS.filter((x) => x.code.toLowerCase().startsWith(q));
  const byName = CHART_OF_ACCOUNTS.filter((x) => !byCode.includes(x) && x.name.toLowerCase().includes(q));
  return [...byCode, ...byName].slice(0, limit);
}

/**
 * Predictive search for an account picker: typing "ca" finds Cash first, "acc" finds Accounts Payable and Accounts Receivable, "dep" the depreciation accounts.
 * Ranked: code prefix, then name starts with the text, then a word of the name starts with it, then the text appears anywhere.
 */
export function suggestAccounts(query: string, limit = 8): Account[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (a: Account): number => {
    const name = a.name.toLowerCase();
    if (a.code.toLowerCase().startsWith(q)) return 0;
    if (name.startsWith(q)) return 1;
    if (name.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))) return 2;
    if (name.includes(q)) return 3;
    return 4;
  };
  return CHART_OF_ACCOUNTS.map((a, i) => ({ a, r: rank(a), i })).filter((x) => x.r < 4).sort((x, y) => x.r - y.r || x.i - y.i).slice(0, limit).map((x) => x.a);
}

/** Chart order is the order of the codes; used to sort trial balances and ledgers. */
export const accountOrder = (code: string): number => CHART_OF_ACCOUNTS.findIndex((x) => x.code === code);
