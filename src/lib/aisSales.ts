// Pure helpers for the AIS Sales desk (the hands-on revenue-cycle workbench). No imports, so the unit tests can load this file directly.
// The database enforces every control; these only decide what the screen offers next and how things are worded.

export type WbOrder = {
  id: string; seq: number; task_id: string | null; customer_id: string; customer: string; item: string; qty: number; unit_price: number;
  net: number; vat: number; gross: number; order_date: string; status: OrderStatus; price_flag: boolean; limit_flag: boolean;
  balance_seen: number | null; exposure_seen: number | null; hold_reason: string | null; entered_by_me: boolean; self_approved: boolean;
  decision_note: string | null; ship_date: string | null; bill_date: string | null; invoice_no: string | null; paid: number;
};
export type OrderStatus = "ENTERED" | "CREDIT_OK" | "HELD" | "APPROVED" | "REJECTED" | "SHIPPED" | "BILLED";
export type WbTask = {
  id: string; seq: number; kind: "ORDER" | "RECEIPT"; ref_no: string; doc_date: string; customer_id: string; customer: string; item_id: string | null; item: string | null;
  qty: number | null; po_price: number | null; amount: number | null; note: string | null; status: "NEW" | "ORDERED" | "REJECTED" | "DONE";
};
export type WbCustomer = { id: string; name: string; credit_limit: number; balance: number; committed: number; available: number; aging: { current: number; d31: number; d61: number; d90: number } };
export type WbItem = { id: string; sku: string; name: string; list_price: number; unit_cost: number; on_hand: number };

export type Step = "check" | "decide" | "ship" | "bill" | "done";

/** What the person does next with an order. */
export function nextStep(status: OrderStatus): Step {
  switch (status) {
    case "ENTERED": return "check";
    case "HELD": return "decide";
    case "CREDIT_OK": case "APPROVED": return "ship";
    case "SHIPPED": return "bill";
    default: return "done";
  }
}

export const STEP_BUTTON: Record<Exclude<Step, "done" | "decide">, string> = { check: "Run the credit check", ship: "Ship", bill: "Bill the customer" };

export const ORDER_LABEL: Record<OrderStatus, string> = {
  ENTERED: "Entered: needs the credit check", CREDIT_OK: "Credit approved by the check", HELD: "Held by the credit check", APPROVED: "Approved: ready to ship",
  REJECTED: "Rejected", SHIPPED: "Shipped: needs billing", BILLED: "Billed",
};
export const ORDER_TONE: Record<OrderStatus, string> = {
  ENTERED: "#F2B13C", CREDIT_OK: "#22D3C5", HELD: "#FF6B7A", APPROVED: "#22D3C5", REJECTED: "#7F8EA0", SHIPPED: "#F2B13C", BILLED: "#22D3C5",
};

/** Invoices a customer can still be asked to pay: billed and not fully paid. */
export function openInvoices(orders: Pick<WbOrder, "id" | "customer_id" | "status" | "gross" | "paid" | "invoice_no">[], customerId: string) {
  return orders.filter((o) => o.customer_id === customerId && o.status === "BILLED" && o.gross - o.paid > 0.004);
}

/** How many cards are finished (billed, cash recorded, or rejected) out of all of them. */
export function deskProgress(tasks: Pick<WbTask, "status">[]): { total: number; done: number; pct: number } {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "DONE" || t.status === "REJECTED").length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** The sentence under the Approve button: who may do it. */
export function approvalNote(o: Pick<WbOrder, "entered_by_me">, solo: boolean): string {
  if (!o.entered_by_me) return "You did not enter this order, so you may act as the credit manager.";
  return solo
    ? "You entered this order. This company allows solo work, so you can approve it yourself, but a self-approval is exactly what an auditor looks for."
    : "You entered this order, so a different person must approve it (segregation of duties).";
}

// ---------------------------------------------------------------- Purchases desk (the expenditure-cycle workbench)

export type PwBillStatus = "ENTERED" | "MATCH_OK" | "HELD" | "APPROVED" | "REJECTED" | "POSTED";
export type PwBill = {
  id: string; seq: number; task_id: string; vendor_id: string; vendor: string; item: string; inv_no: string; inv_qty: number; inv_price: number; net: number; vat: number; gross: number;
  inv_date: string; po_qty: number | null; po_price: number | null; rec_qty: number | null; status: PwBillStatus; hold_reason: string | null; entered_by_me: boolean;
  self_approved: boolean; decision_note: string | null; paid: number;
};
export type PwTask = {
  id: string; seq: number; kind: "PURCHASE" | "PAYMENT"; vendor_id: string; vendor: string; vendor_approved: boolean; item_id: string | null; item: string | null; ref_no: string;
  po_qty: number | null; po_price: number | null; rr_no: string | null; rr_qty: number | null; rr_date: string | null; inv_no: string | null; inv_qty: number | null; inv_price: number | null;
  doc_date: string; amount: number | null; note: string | null; status: "NEW" | "RECEIVED" | "INVOICED" | "REJECTED" | "DONE"; received: boolean;
};

export type PwStep = "match" | "decide" | "post" | "done";

/** What comes next for an entered vendor invoice. */
export function pwNextStep(status: PwBillStatus): PwStep {
  switch (status) {
    case "ENTERED": return "match";
    case "HELD": return "decide";
    case "MATCH_OK": case "APPROVED": return "post";
    default: return "done";
  }
}

export const PW_STEP_BUTTON: Record<Exclude<PwStep, "done" | "decide">, string> = { match: "Run the three-way match", post: "Post to payables" };

export const PW_LABEL: Record<PwBillStatus, string> = {
  ENTERED: "Entered: needs the three-way match", MATCH_OK: "Matched: ready to post", HELD: "Held by the match", APPROVED: "Approved: ready to post", REJECTED: "Rejected", POSTED: "Posted to payables",
};
export const PW_TONE: Record<PwBillStatus, string> = { ENTERED: "#F2B13C", MATCH_OK: "#22D3C5", HELD: "#FF6B7A", APPROVED: "#22D3C5", REJECTED: "#7F8EA0", POSTED: "#22D3C5" };

/** Posted invoices a vendor can still be paid against. */
export function payableBills<T extends Pick<PwBill, "id" | "vendor_id" | "status" | "gross" | "paid">>(bills: T[], vendorId: string): T[] {
  return bills.filter((b) => b.vendor_id === vendorId && b.status === "POSTED" && b.gross - b.paid > 0.004);
}

/** The three documents side by side: where do quantity and price disagree? */
export function matchRows(t: Pick<PwTask, "po_qty" | "po_price" | "rr_qty" | "inv_qty" | "inv_price">): { label: string; po: string; rr: string; inv: string; differs: boolean }[] {
  const f = (n: number | null) => (n === null ? "none" : String(n));
  return [
    { label: "Quantity", po: f(t.po_qty), rr: f(t.rr_qty), inv: f(t.inv_qty), differs: [t.po_qty, t.rr_qty, t.inv_qty].some((v) => v === null) || !(t.po_qty === t.rr_qty && t.rr_qty === t.inv_qty) },
    { label: "Unit price", po: f(t.po_price), rr: "n/a", inv: f(t.inv_price), differs: t.po_price === null || t.po_price !== t.inv_price },
  ];
}

// ---------------------------------------------------------------- Payroll desk

export type PrState = "NEW" | "CLEAN" | "HELD" | "ACCEPTED" | "REJECTED" | "POSTED" | "PAID" | "DONE";
export type PrTask = {
  id: string; seq: number; kind: "TIME" | "RATE_CHANGE" | "RUN"; employee_id: string | null; emp_name: string; on_file: boolean; hours: number | null; ot_hours: number | null;
  ot_approved: boolean | null; new_rate: number | null; form_attached: boolean | null; note: string | null; state: PrState; flag_text: string | null; checked_by_me: boolean;
  self_approved: boolean; decision_note: string | null; gross: number | null; deductions: number | null; net: number | null; current_rate: number | null;
};

export const PR_LABEL: Record<PrState, string> = {
  NEW: "Not checked yet", CLEAN: "Checked: clean", HELD: "Held by the check", ACCEPTED: "Approved", REJECTED: "Rejected", POSTED: "Posted to the ledger", PAID: "Paid", DONE: "Posted and paid",
};
export const PR_TONE: Record<PrState, string> = {
  NEW: "#F2B13C", CLEAN: "#22D3C5", HELD: "#FF6B7A", ACCEPTED: "#22D3C5", REJECTED: "#7F8EA0", POSTED: "#22D3C5", PAID: "#22D3C5", DONE: "#22D3C5",
};

/** Cards still waiting for a decision: not checked, or held by the check. The payroll cannot be posted until this is zero. */
export function prUndecided(tasks: Pick<PrTask, "kind" | "state">[]): number {
  return tasks.filter((t) => t.kind !== "RUN" && (t.state === "NEW" || t.state === "HELD")).length;
}

/** What the run card offers next: post the vouchers, pay the net pay, or nothing. */
export function prRunStep(tasks: Pick<PrTask, "kind" | "state">[]): "wait" | "post" | "pay" | "done" {
  const run = tasks.find((t) => t.kind === "RUN");
  if (!run) return "wait";
  if (run.state === "DONE") return "done";
  if (run.state === "POSTED") return "pay";
  return prUndecided(tasks) === 0 ? "post" : "wait";
}

// ---------------------------------------------------------------- Fixed Assets desk

export type FaTask = {
  id: string; seq: number; kind: "INVOICE" | "DEPRECIATION" | "DISPOSAL"; title: string; vendor: string | null; inv_no: string | null; doc_date: string; net: number | null;
  life_months: number | null; proceeds: number | null; note: string | null; state: "NEW" | "DONE"; decision: "CAPITALIZE" | "EXPENSE" | null;
};
export type FaAsset = { id: string; code: string; name: string; cost: number; life_months: number; in_service: string; acc_dep: number; nbv: number; status: "ACTIVE" | "DISPOSED" };

/** What the Depreciation and Disposal cards may do now: depreciation needs every invoice decided; the sale needs depreciation first. */
export function faReady(tasks: Pick<FaTask, "kind" | "state">[]): { depreciate: boolean; dispose: boolean } {
  const invoicesOpen = tasks.some((t) => t.kind === "INVOICE" && t.state === "NEW");
  const dep = tasks.find((t) => t.kind === "DEPRECIATION");
  return { depreciate: !invoicesOpen && dep?.state === "NEW", dispose: dep?.state === "DONE" };
}

/** The monthly straight-line charge the register will show for an asset (full month if in service by the 15th). */
export function monthlyDepreciation(cost: number, salvage: number, lifeMonths: number): number {
  return Math.round(((cost - salvage) / lifeMonths) * 100) / 100;
}

// ---------------------------------------------------------------- Period-end close and statements

export type ClTask = { id: string; seq: number; kind: "ALLOWANCE" | "ACCRUAL" | "CLOSING"; title: string; note: string | null; amount: number | null; state: "NEW" | "DONE"; decision: "ACCRUE" | "SKIP" | null };
type FsLine = { code: string; name: string; amount: number | string };
export type Statements = {
  through: string; closed: boolean; td: number | string; tc: number | string; tb_ok: boolean;
  trial_balance: { code: string; name: string; type: string; debit: number | string; credit: number | string }[];
  income: { revenue: FsLine[]; expenses: FsLine[]; total_revenue: number | string; total_expenses: number | string; net_income: number | string };
  balance: { assets: FsLine[]; liabilities: FsLine[]; equity_accounts: FsLine[]; current_earnings: number | string; total_assets: number | string; total_liabilities: number | string; total_equity: number | string; balanced: boolean };
};

/** The closing entries need both adjusting entries first. */
export function clReady(tasks: Pick<ClTask, "kind" | "state">[]): { close: boolean } {
  return { close: tasks.filter((t) => t.kind !== "CLOSING").every((t) => t.state === "DONE") && tasks.some((t) => t.kind === "CLOSING" && t.state === "NEW") };
}
