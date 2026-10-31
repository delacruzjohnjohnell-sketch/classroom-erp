import { supabase } from "@/lib/supabase";
import type { PracticeData } from "@/lib/practiceCheck";

/** Reads one Standard company as the snapshot the practice-set checks run against. Used by the teacher's Check and by the class Scores page. */
export async function loadPracticeData(tenantId: string): Promise<PracticeData> {
  const rows = (table: string, cols: string) => supabase.from(table).select(cols).eq("tenant_id", tenantId);
  const count = (table: string) => supabase.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);

  const [tenant, accounts, entries, customers, vendors, items, employees, invoices, invoicePayments, bills, billPayments,
    quotes, loans, fixedAssets, recurring, payrollRuns, bankTxns, attachments, leave] = await Promise.all([
    supabase.from("tenants").select("books_locked_through, approval_threshold").eq("id", tenantId).single(),
    rows("accounts", "id, code, name, type"),
    rows("journal_entries", "id, entry_date, memo, journal_lines(account_id, debit, credit)"),
    rows("customers", "name"),
    rows("vendors", "name"),
    rows("items", "sku, name, qty_on_hand, unit_cost, reorder_point"),
    rows("employees", "name, salary, pay_type, hourly_rate"),
    rows("invoices", "id, total, tax_amount, status, due_date"),
    rows("invoice_payments", "invoice_id, amount"),
    rows("bills", "id, total, tax_amount, status, due_date"),
    rows("bill_payments", "bill_id, amount"),
    rows("quotes", "status"),
    rows("employee_loans", "principal, monthly_deduction, balance_remaining, status"),
    rows("fixed_assets", "name, cost, salvage_value, useful_life_months, accumulated_depreciation"),
    rows("recurring_entries", "memo, frequency, active"),
    rows("payroll_runs", "run_type, total"),
    rows("bank_transactions", "amount, reconciled, matched_journal_entry_id"),
    count("attachments"),
    count("leave_requests"),
  ]);

  const failed = [tenant, accounts, entries, customers, vendors, items, employees, invoices, invoicePayments, bills, billPayments,
    quotes, loans, fixedAssets, recurring, payrollRuns, bankTxns, attachments, leave].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const list = (r: { data: unknown }) => ((r.data as any[]) ?? []);
  return {
    tenant: tenant.data as any,
    accounts: list(accounts), entries: list(entries), customers: list(customers), vendors: list(vendors), items: list(items),
    employees: list(employees), invoices: list(invoices), invoicePayments: list(invoicePayments), bills: list(bills),
    billPayments: list(billPayments), quotes: list(quotes), loans: list(loans), fixedAssets: list(fixedAssets),
    recurring: list(recurring), payrollRuns: list(payrollRuns), bankTxns: list(bankTxns),
    attachments: attachments.count ?? 0, leaveRequests: leave.count ?? 0,
  };
}
