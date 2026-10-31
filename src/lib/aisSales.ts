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
