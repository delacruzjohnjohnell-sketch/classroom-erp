import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustmentSchema, confirmationSchema, expiresSoon, fgReceiptSchema, firstIssue, issueSchema, orderSchema, outstanding,
  pickLots, poSchema, qtyText, receiptSchema, stockValue, transferSchema, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, DOC_TYPE_LABEL,
} from "../src/lib/mfgOps.ts";

const msg = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? "OK" : r.error!.issues[0].message);

test("a purchase order needs a vendor, lines with a quantity, and sensible dates", () => {
  const line = { item_id: "lum", qty: "200", unit_price: "65" };
  const po = { vendor_id: "v1", order_date: "2026-11-10", expected_date: "2026-11-12", lines: [line] };
  assert.equal(msg(poSchema.safeParse(po)), "OK");
  assert.equal(msg(poSchema.safeParse({ ...po, vendor_id: "" })), "Choose a vendor.");
  assert.equal(msg(poSchema.safeParse({ ...po, lines: [] })), "Add at least one line.");
  assert.equal(msg(poSchema.safeParse({ ...po, lines: [{ ...line, qty: "0" }] })), "Quantity must be above zero.");
  assert.equal(msg(poSchema.safeParse({ ...po, lines: [{ ...line, unit_price: "-1" }] })), "Price can't be negative.");
  assert.equal(msg(poSchema.safeParse({ ...po, expected_date: "2026-11-01" })), "The expected date can't be before the order date.");
});

test("a goods receipt needs at least one quantity, and blank optional fields become null", () => {
  const r = receiptSchema.safeParse({ receipt_date: "2026-11-12", lines: [{ po_line_id: "l1", qty: "120", location_id: "", batch_no: " V1 ", expiry: "" }] });
  assert.equal(r.success, true);
  if (r.success) { assert.equal(r.data.lines[0].location_id, null); assert.equal(r.data.lines[0].batch_no, "V1"); assert.equal(r.data.lines[0].expiry, null); }
  assert.equal(msg(receiptSchema.safeParse({ receipt_date: "2026-11-12", lines: [{ po_line_id: "l1", qty: "0" }] })), "Enter the quantity you received on at least one line.");
});

test("an opening balance can't take stock away; a count can; zero is refused", () => {
  const base = { item_id: "i", location_id: "l", reason: "OPENING", qty_change: "10", unit_cost: "", posting_date: "2026-11-05" };
  assert.equal(msg(adjustmentSchema.safeParse(base)), "OK");
  assert.equal(msg(adjustmentSchema.safeParse({ ...base, qty_change: "-3" })), "An opening balance adds stock. Use a stock count to take stock away.");
  assert.equal(msg(adjustmentSchema.safeParse({ ...base, reason: "COUNT", qty_change: "-3" })), "OK");
  assert.equal(msg(adjustmentSchema.safeParse({ ...base, qty_change: "0" })), "Enter how much the stock changes by.");
  assert.equal(msg(adjustmentSchema.safeParse({ ...base, unit_cost: "-5" })), "The unit cost can't be negative.");
  const c = adjustmentSchema.safeParse({ ...base, unit_cost: "60" });
  assert.equal(c.success && c.data.unit_cost, 60);
});

test("a transfer needs two different places and a quantity", () => {
  const t = { item_id: "i", from_id: "a", to_id: "b", qty: "4", posting_date: "2026-11-25" };
  assert.equal(msg(transferSchema.safeParse(t)), "OK");
  assert.equal(msg(transferSchema.safeParse({ ...t, to_id: "a" })), "Choose two different locations.");
  assert.equal(msg(transferSchema.safeParse({ ...t, qty: "0" })), "Quantity must be above zero.");
});

test("a production order needs an item, a quantity and a finish date after the start", () => {
  const o = { item_id: "chair", qty: "100", planned_start: "2026-11-16", planned_end: "2026-11-30", backflush: false };
  assert.equal(msg(orderSchema.safeParse(o)), "OK");
  assert.equal(msg(orderSchema.safeParse({ ...o, planned_end: "2026-11-01" })), "The finish date can't be before the start date.");
  assert.equal(msg(orderSchema.safeParse({ ...o, item_id: "" })), "Choose the item to make.");
});

test("an issue needs a quantity on at least one component", () => {
  assert.equal(msg(issueSchema.safeParse({ posting_date: "2026-11-16", lines: [{ component_id: "c1", qty: "310" }, { component_id: "c2", qty: "0" }] })), "OK");
  assert.equal(msg(issueSchema.safeParse({ posting_date: "2026-11-16", lines: [{ component_id: "c1", qty: "0" }] })), "Enter a quantity to issue on at least one component.");
});

test("a confirmation needs output or hours, and scrap needs a reason", () => {
  const c = { op_no: "10", yield_qty: "98", scrap_qty: "2", scrap_reason: "Cracked", setup_h: "0", labor_h: "160", machine_h: "52", is_final: true, posting_date: "2026-11-20" };
  const ok = confirmationSchema.safeParse(c);
  assert.equal(ok.success, true);
  if (ok.success) assert.equal(ok.data.op_no, 10);
  assert.equal(msg(confirmationSchema.safeParse({ ...c, scrap_reason: "" })), "Say why the units were scrapped.");
  assert.equal(msg(confirmationSchema.safeParse({ ...c, yield_qty: "0", scrap_qty: "0", labor_h: "0", machine_h: "0" })), "Enter the units made or the hours worked.");
  const none = confirmationSchema.safeParse({ ...c, op_no: "" });
  assert.equal(none.success && none.data.op_no, null);
  assert.equal(msg(confirmationSchema.safeParse({ ...c, labor_h: "-1" })), "Labor hours can't be negative.");
});

test("finished goods in need a quantity", () => {
  assert.equal(msg(fgReceiptSchema.safeParse({ qty: "60", posting_date: "2026-11-21" })), "OK");
  assert.equal(msg(fgReceiptSchema.safeParse({ qty: "0", posting_date: "2026-11-21" })), "Quantity must be above zero.");
  assert.equal(firstIssue(poSchema.safeParse({}).error!).length > 0, true);
});

test("the lot preview takes earliest expiry first, then oldest, and reports a shortfall", () => {
  const lots = [
    { id: "V1", batch_no: "V1", qty: 25, expiry: "2027-06-30", received_on: "2026-11-12" },
    { id: "V0", batch_no: "V0", qty: 10, expiry: "2027-01-31", received_on: "2026-11-05" },
    { id: "none", batch_no: null, qty: 5, expiry: null, received_on: "2026-10-01" },
  ];
  const r = pickLots(lots, 20);
  assert.deepEqual(r.picks.map((p) => [p.id, p.qty]), [["V0", 10], ["V1", 10]]);
  assert.equal(r.short, 0);
  const big = pickLots(lots, 45);
  assert.deepEqual(big.picks.map((p) => p.id), ["V0", "V1", "none"]);
  assert.equal(big.short, 5);
  const fifo = pickLots([{ id: "b", batch_no: "B", qty: 5, expiry: null, received_on: "2026-11-02" }, { id: "a", batch_no: "A", qty: 5, expiry: null, received_on: "2026-11-01" }], 3);
  assert.deepEqual(fifo.picks, [{ id: "a", batch_no: "A", qty: 3 }]);
  assert.deepEqual(pickLots([{ id: "z", batch_no: "Z", qty: 0, expiry: "2026-01-01", received_on: null }], 1).picks, []);
});

test("small helpers", () => {
  assert.equal(outstanding(200, 120), 80);
  assert.equal(outstanding(200, 250), 0);
  assert.equal(stockValue(10, 63.333333), 633.33);
  assert.equal(qtyText("12.000000"), "12");
  assert.equal(qtyText(0.2), "0.2");
  assert.equal(expiresSoon("2026-12-01", "2026-11-20"), true);
  assert.equal(expiresSoon("2027-06-30", "2026-11-20"), false);
  assert.equal(expiresSoon(null, "2026-11-20"), false);
  assert.equal(ORDER_STATUS_LABEL.PARTIALLY_CONFIRMED, "In progress");
  assert.equal(ORDER_STATUS_TONE.DELIVERED, "good");
  assert.equal(DOC_TYPE_LABEL.FGR, "Finished goods receipt");
});
