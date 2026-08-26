export type Role = "student" | "teacher";

export type Profile = {
  id: string;
  full_name: string | null;
  role: Role;
  tenant_id: string | null;
};

export type Tenant = { id: string; name: string; owner_id: string | null; created_at: string };

export type Account = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
};

export type JournalEntry = { id: string; tenant_id: string; entry_date: string; memo: string | null };
export type JournalLine = { id: string; journal_entry_id: string; account_id: string; debit: number; credit: number };

export type Vendor = { id: string; tenant_id: string; name: string; contact: string | null };
export type PurchaseOrder = { id: string; tenant_id: string; vendor_id: string; order_date: string; status: "draft" | "received"; total: number };
export type PurchaseOrderLine = { id: string; purchase_order_id: string; description: string; qty: number; unit_cost: number };

export type Item = { id: string; tenant_id: string; sku: string | null; name: string; qty_on_hand: number; unit_cost: number; reorder_point: number };

export type Customer = { id: string; tenant_id: string; name: string; email: string | null };
export type SalesOrder = { id: string; tenant_id: string; customer_id: string; order_date: string; status: "draft" | "fulfilled"; total: number };
export type SalesOrderLine = { id: string; sales_order_id: string; item_id: string | null; description: string; qty: number; unit_price: number };

export type Employee = { id: string; tenant_id: string; name: string; title: string | null; department: string | null; salary: number };
export type PayrollRun = { id: string; tenant_id: string; run_date: string; total: number; headcount: number };

export const money = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const todayStr = () => new Date().toISOString().slice(0, 10);
