import test from "node:test";
import assert from "node:assert/strict";
import { cleanLines, lineTotals, postProblem, progress, nextPending, groupControls, money, emptyLine } from "../src/lib/aisDesk.ts";

const L = (acct: string, debit = "", credit = "") => ({ acct, debit, credit });
const CHART = ["1000", "1100", "2200", "4000", "5000", "1200"];

test("only filled-in lines are sent, with amounts rounded to centavos", () => {
  const lines = [L("1100", "117,600.00"), L("4000", "", "105000"), L(""), L("2200", "", "12600.004"), emptyLine()];
  assert.deepEqual(cleanLines(lines), [
    { acct: "1100", debit: 117600, credit: 0 }, { acct: "4000", debit: 0, credit: 105000 }, { acct: "2200", debit: 0, credit: 12600 },
  ]);
  assert.deepEqual(cleanLines([L("1100", "abc", "")]), []);
});

test("totals and balance", () => {
  assert.deepEqual(lineTotals([L("1100", "100"), L("4000", "", "100")]), { debit: 100, credit: 100, diff: 0, balanced: true });
  assert.equal(lineTotals([L("1100", "100"), L("4000", "", "90")]).balanced, false);
  assert.equal(lineTotals([L("1100", "100")]).balanced, false);          // one line is not an entry
  assert.equal(lineTotals([]).balanced, false);
  assert.equal(lineTotals([L("1100", "0.1"), L("1100", "0.2"), L("4000", "", "0.3")]).balanced, true);   // no floating-point drift
});

test("the Post button explains what is wrong, in order of importance", () => {
  assert.match(postProblem([L("1100", "100")], CHART), /at least two lines/);
  assert.match(postProblem([L("1100", "100", "50"), L("4000", "", "50")], CHART), /either a debit or a credit/);
  assert.match(postProblem([L("9999", "100"), L("4000", "", "100")], CHART), /9999 is not in the chart/);
  assert.match(postProblem([L("1100", "100"), L("4000", "", "90")], CHART), /does not balance: debits 100\.00 and credits 90\.00/);
  assert.equal(postProblem([L("1100", "100"), L("4000", "", "100")], CHART), "");
});

test("money shows two decimals and a dash for nothing", () => {
  assert.equal(money(1234.5), "1,234.50");
  assert.equal(money(null), "—");
  assert.equal(money(undefined), "—");
});

test("progress counts decided documents", () => {
  assert.deepEqual(progress([]), { total: 0, decided: 0, pending: 0, pct: 0 });
  assert.deepEqual(progress([{ status: "POSTED" }, { status: "HELD" }, { status: "PENDING" }, { status: "PENDING" }]), { total: 4, decided: 2, pending: 2, pct: 50 });
});

test("the next document waits after the current one and wraps round", () => {
  const rows = [
    { id: "a", seq: 1, status: "POSTED" as const }, { id: "b", seq: 2, status: "PENDING" as const },
    { id: "c", seq: 3, status: "HELD" as const }, { id: "d", seq: 4, status: "PENDING" as const },
  ];
  assert.equal(nextPending(rows), "b");
  assert.equal(nextPending(rows, "b"), "d");
  assert.equal(nextPending(rows, "d"), "b");                              // wraps
  assert.equal(nextPending(rows.map((r) => ({ ...r, status: "POSTED" as const }))), null);
});

test("controls are grouped by Hall's category, alphabetically", () => {
  const g = groupControls([
    { tag: "B", label: "Beta", hall_category: "Timing", description: "" }, { tag: "A", label: "Alpha", hall_category: "Accuracy", description: "" },
    { tag: "C", label: "Charlie", hall_category: "Timing", description: "" }, { tag: "Z", label: "Aardvark", hall_category: "Timing", description: "" },
  ]);
  assert.deepEqual(g.map((x) => x.category), ["Accuracy", "Timing"]);
  assert.deepEqual(g[1].items.map((x) => x.tag), ["Z", "B", "C"]);
});

test("a document nobody decided is not called held", async () => {
  const { statusText } = await import("../src/lib/aisDesk.ts");
  assert.equal(statusText({ status: "PENDING" }).label, "Waiting for your decision");
  assert.equal(statusText({ status: "POSTED", was_decided: true }).label, "Posted");
  assert.equal(statusText({ status: "HELD", was_decided: true }).label, "Held");
  assert.equal(statusText({ status: "HELD", was_decided: false }).label, "Not decided");
  assert.equal(statusText({ status: "HELD" }).label, "Held");                 // an older server that does not send the flag
});

test("packet fields read like a paper document whatever order the database returns them in", async () => {
  const { orderFields } = await import("../src/lib/aisDesk.ts");
  // jsonb returns short keys first, then alphabetical
  const stored = { Date: "d", Item: "i", Amount: "5", "Invoice no.": "INV-1", Status: "ok", Customer: "c", Mystery: "x" };
  assert.deepEqual(orderFields(stored).map((e) => e[0]), ["Invoice no.", "Date", "Customer", "Item", "Amount", "Status", "Mystery"]);
});

test("sales desk: what comes next for an order, and which invoices can still be paid", async () => {
  const { nextStep, openInvoices, deskProgress, approvalNote } = await import("../src/lib/aisSales.ts");
  assert.equal(nextStep("ENTERED"), "check");
  assert.equal(nextStep("HELD"), "decide");
  assert.equal(nextStep("CREDIT_OK"), "ship");
  assert.equal(nextStep("APPROVED"), "ship");
  assert.equal(nextStep("SHIPPED"), "bill");
  assert.equal(nextStep("BILLED"), "done");
  assert.equal(nextStep("REJECTED"), "done");
  const orders = [
    { id: "a", customer_id: "c1", status: "BILLED", gross: 100, paid: 100, invoice_no: "INV-1" },
    { id: "b", customer_id: "c1", status: "BILLED", gross: 100, paid: 40, invoice_no: "INV-2" },
    { id: "c", customer_id: "c1", status: "SHIPPED", gross: 50, paid: 0, invoice_no: null },
    { id: "d", customer_id: "c2", status: "BILLED", gross: 70, paid: 0, invoice_no: "INV-3" },
  ] as Parameters<typeof openInvoices>[0];
  assert.deepEqual(openInvoices(orders, "c1").map((o) => o.id), ["b"]);
  assert.deepEqual(deskProgress([{ status: "DONE" }, { status: "REJECTED" }, { status: "NEW" }, { status: "ORDERED" }]), { total: 4, done: 2, pct: 50 });
  assert.match(approvalNote({ entered_by_me: true }, false), /different person/);
  assert.match(approvalNote({ entered_by_me: true }, true), /self-approval/);
  assert.match(approvalNote({ entered_by_me: false }, false), /credit manager/);
});

test("purchases desk: next step for a vendor invoice, payable invoices, and the three-way comparison", async () => {
  const { pwNextStep, payableBills, matchRows } = await import("../src/lib/aisSales.ts");
  assert.equal(pwNextStep("ENTERED"), "match");
  assert.equal(pwNextStep("HELD"), "decide");
  assert.equal(pwNextStep("MATCH_OK"), "post");
  assert.equal(pwNextStep("APPROVED"), "post");
  assert.equal(pwNextStep("POSTED"), "done");
  assert.equal(pwNextStep("REJECTED"), "done");
  const bills = [
    { id: "a", vendor_id: "v1", status: "POSTED", gross: 100, paid: 100 },
    { id: "b", vendor_id: "v1", status: "POSTED", gross: 100, paid: 0 },
    { id: "c", vendor_id: "v1", status: "HELD", gross: 100, paid: 0 },
    { id: "d", vendor_id: "v2", status: "POSTED", gross: 100, paid: 0 },
  ] as Parameters<typeof payableBills>[0];
  assert.deepEqual(payableBills(bills, "v1").map((b) => b.id), ["b"]);
  const agree = matchRows({ po_qty: 200, po_price: 1640, rr_qty: 200, inv_qty: 200, inv_price: 1640 });
  assert.equal(agree.some((r) => r.differs), false);
  const short = matchRows({ po_qty: 150, po_price: 1480, rr_qty: 120, inv_qty: 150, inv_price: 1480 });
  assert.equal(short[0].differs, true);
  assert.equal(short[1].differs, false);
  const noRr = matchRows({ po_qty: 80, po_price: 1640, rr_qty: null, inv_qty: 80, inv_price: 1640 });
  assert.equal(noRr[0].differs, true);
});

test("payroll desk: the run waits for every card to be decided, then posts, then pays", async () => {
  const { prUndecided, prRunStep } = await import("../src/lib/aisSales.ts");
  const t = (kind: string, state: string) => ({ kind, state }) as Parameters<typeof prUndecided>[0][number];
  assert.equal(prUndecided([t("TIME", "NEW"), t("TIME", "HELD"), t("TIME", "CLEAN"), t("RATE_CHANGE", "REJECTED"), t("RUN", "NEW")]), 2);
  assert.equal(prRunStep([t("TIME", "NEW"), t("RUN", "NEW")]), "wait");
  assert.equal(prRunStep([t("TIME", "CLEAN"), t("TIME", "REJECTED"), t("RUN", "NEW")]), "post");
  assert.equal(prRunStep([t("TIME", "POSTED"), t("RUN", "POSTED")]), "pay");
  assert.equal(prRunStep([t("TIME", "PAID"), t("RUN", "DONE")]), "done");
});

test("fixed assets desk: depreciation waits for the invoices, the sale waits for depreciation", async () => {
  const { faReady, monthlyDepreciation } = await import("../src/lib/aisSales.ts");
  const t = (kind: string, state: string) => ({ kind, state }) as Parameters<typeof faReady>[0][number];
  assert.deepEqual(faReady([t("INVOICE", "NEW"), t("DEPRECIATION", "NEW"), t("DISPOSAL", "NEW")]), { depreciate: false, dispose: false });
  assert.deepEqual(faReady([t("INVOICE", "DONE"), t("DEPRECIATION", "NEW"), t("DISPOSAL", "NEW")]), { depreciate: true, dispose: false });
  assert.deepEqual(faReady([t("INVOICE", "DONE"), t("DEPRECIATION", "DONE"), t("DISPOSAL", "NEW")]), { depreciate: false, dispose: true });
  assert.equal(monthlyDepreciation(1250000, 0, 60), 20833.33);
  assert.equal(monthlyDepreciation(135000, 0, 36), 3750);
});

test("close: the closing entries wait for both adjusting entries", async () => {
  const { clReady } = await import("../src/lib/aisSales.ts");
  const t = (kind: string, state: string) => ({ kind, state }) as Parameters<typeof clReady>[0][number];
  assert.equal(clReady([t("ALLOWANCE", "NEW"), t("ACCRUAL", "NEW"), t("CLOSING", "NEW")]).close, false);
  assert.equal(clReady([t("ALLOWANCE", "DONE"), t("ACCRUAL", "NEW"), t("CLOSING", "NEW")]).close, false);
  assert.equal(clReady([t("ALLOWANCE", "DONE"), t("ACCRUAL", "DONE"), t("CLOSING", "NEW")]).close, true);
  assert.equal(clReady([t("ALLOWANCE", "DONE"), t("ACCRUAL", "DONE"), t("CLOSING", "DONE")]).close, false);
});
