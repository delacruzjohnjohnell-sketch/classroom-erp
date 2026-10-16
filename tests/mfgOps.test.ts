import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustmentSchema, confirmationSchema, expiresSoon, fgReceiptSchema, firstIssue, issueSchema, orderSchema, outstanding,
  pickLots, poSchema, qtyText, receiptSchema, stockValue, transferSchema, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, DOC_TYPE_LABEL,
  canReverse, deliverySchema, landedCostSchema, matchLine, spreadAmount, toleranceSchema, vendorInvoiceSchema, INVOICE_STATUS_LABEL, BASIS_LABEL, outputReceiptSchema, remaining, reverseSchema, reversedIds, settleSchema, VARIANCE_HELP,
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

test("a reversal needs a reason and a date; settling needs a date", () => {
  assert.equal(msg(reverseSchema.safeParse({ reason: "  ", posting_date: "2026-12-01" })), "Say why you are reversing it — the reason stays on the record.");
  assert.equal(msg(reverseSchema.safeParse({ reason: "ok", posting_date: "2026-12-01" })), "Say why you are reversing it — the reason stays on the record.");
  assert.equal(msg(reverseSchema.safeParse({ reason: "wrong lot", posting_date: "12/01/2026" })), "Choose the date of the reversal.");
  const good = reverseSchema.parse({ reason: "  wrong lot ", posting_date: "2026-12-01" });
  assert.equal(good.reason, "wrong lot");
  assert.equal(msg(settleSchema.safeParse({ posting_date: "" })), "Choose the settlement date.");
  assert.equal(msg(settleSchema.safeParse({ posting_date: "2026-12-01" })), "OK");
});

test("only documents that are not reversals and not yet reversed can be reversed", () => {
  const rows = [
    { id: "a", doc_type: "GI", reversal_of: null },
    { id: "b", doc_type: "REV", reversal_of: "a" },
    { id: "c", doc_type: "FGR", reversal_of: null },
  ];
  const done = reversedIds(rows);
  assert.deepEqual([...done], ["a"]);
  assert.equal(canReverse(rows[0], done), false);   // already reversed
  assert.equal(canReverse(rows[1], done), false);   // is itself a reversal
  assert.equal(canReverse(rows[2], done), true);
  assert.equal(canReverse({ id: "k", reversal_of: null }, done), true);   // a confirmation has no doc type
  assert.equal(canReverse({ id: "r", reversal_of: "k" }, done), false);
});

test("a delivery needs a quantity on at least one line; a co-product receipt needs a quantity", () => {
  const line = (qty: string) => ({ so_line_id: "l1", qty });
  assert.equal(msg(deliverySchema.safeParse({ so_id: "s", posting_date: "2026-12-03", lines: [line("0"), line("0")] })), "Enter a quantity to deliver on at least one line.");
  assert.equal(msg(deliverySchema.safeParse({ so_id: "s", posting_date: "2026-12-03", lines: [line("-1")] })), "Quantity can't be negative.");
  assert.equal(msg(deliverySchema.safeParse({ so_id: "", posting_date: "2026-12-03", lines: [line("1")] })), "Choose a sales order.");
  assert.equal(msg(deliverySchema.safeParse({ so_id: "s", posting_date: "2026-12-03", lines: [line("0"), line("4")] })), "OK");
  assert.equal(msg(outputReceiptSchema.safeParse({ output_id: "o", qty: "0", posting_date: "2026-12-03" })), "Quantity must be above zero.");
  const r = outputReceiptSchema.parse({ output_id: "o", qty: "5", location_id: "", batch_no: " ", posting_date: "2026-12-03" });
  assert.equal(r.location_id, null);
  assert.equal(r.batch_no, null);
});

test("what is left to deliver never goes below zero or shows float noise", () => {
  assert.equal(remaining(50, 30), 20);
  assert.equal(remaining(50, 55), 0);
  assert.equal(remaining(0.3, 0.1), 0.2);
  assert.ok(VARIANCE_HELP.MATERIAL.length > 20 && VARIANCE_HELP.RESIDUAL.includes("written off"));
});

test("the invoice match compares quantity with what is open and price with the order, both inside the tolerance", () => {
  assert.deepEqual(matchLine(200, 200, 65, 65, 2), { qtyPct: 0, pricePct: 0, ok: true });
  assert.deepEqual(matchLine(100, 100, 65, 66, 2), { qtyPct: 0, pricePct: 1.54, ok: true });
  assert.deepEqual(matchLine(100, 100, 65, 64, 2), { qtyPct: 0, pricePct: -1.54, ok: true });
  assert.equal(matchLine(100, 100, 65, 68, 2).ok, false);          // 4.62 % dearer
  assert.equal(matchLine(100, 100, 65, 68, 5).ok, true);           // the teacher widened the tolerance
  assert.equal(matchLine(60, 100, 65, 65, 2).qtyPct, 66.67);       // billed more than arrived
  assert.equal(matchLine(100, 60, 65, 65, 2).ok, true);            // billing less than is open is fine
  assert.equal(matchLine(0, 10, 1, 1, 2).qtyPct, 100);             // nothing is open to invoice
});

test("a landed cost is spread to the centavo and the leftover goes to the first biggest line", () => {
  assert.deepEqual(spreadAmount(1300, [12000, 1000]), [1200, 100]);
  assert.deepEqual(spreadAmount(1000, [1, 1, 1]), [333.34, 333.33, 333.33]);
  assert.equal(spreadAmount(100.01, [3, 1]).reduce((a, b) => Math.round((a + b) * 100) / 100, 0), 100.01);
  assert.deepEqual(spreadAmount(500, [0, 0]), [0, 0]);
});

test("vendor invoice and landed cost forms need the essentials", () => {
  const line = { po_line_id: "l1", qty: "10", unit_price: "65" };
  const base = { po_id: "p", vendor_ref: "V-1", invoice_date: "2026-12-05", due_date: "", tax_rate: "12", lines: [line] };
  assert.equal(msg(vendorInvoiceSchema.safeParse(base)), "OK");
  assert.equal(msg(vendorInvoiceSchema.safeParse({ ...base, vendor_ref: " " })), "Enter the number printed on the vendor's invoice.");
  assert.equal(msg(vendorInvoiceSchema.safeParse({ ...base, lines: [{ ...line, qty: "0" }] })), "Enter the quantity and price billed on at least one line.");
  assert.equal(msg(vendorInvoiceSchema.safeParse({ ...base, due_date: "2026-12-01" })), "The due date can't be before the invoice date.");
  assert.equal(msg(vendorInvoiceSchema.safeParse({ ...base, tax_rate: "120" })), "The VAT rate can't be more than 100 percent.");
  const lc = { vendor_id: "v", vendor_ref: "F-1", voucher_date: "2026-12-25", due_date: "", basis: "WEIGHT", amount: "1000", tax_rate: "0", description: "", lines: [{ doc_line_id: "d1", weight: "0", volume: "0" }] };
  assert.equal(msg(landedCostSchema.safeParse(lc)), "Enter the weight of the lines you chose.");
  assert.equal(msg(landedCostSchema.safeParse({ ...lc, lines: [{ doc_line_id: "d1", weight: "5", volume: "0" }] })), "OK");
  assert.equal(msg(landedCostSchema.safeParse({ ...lc, basis: "VALUE" })), "OK");
  assert.equal(msg(landedCostSchema.safeParse({ ...lc, amount: "0" })), "The amount must be above zero.");
  assert.equal(msg(landedCostSchema.safeParse({ ...lc, lines: [] })), "Choose at least one receipt line to spread the cost over.");
  assert.equal(msg(toleranceSchema.safeParse({ pct: "60" })), "The tolerance can't be more than 50 percent.");
  assert.equal(msg(toleranceSchema.safeParse({ pct: "2.5" })), "OK");
  assert.equal(INVOICE_STATUS_LABEL.HELD, "On hold");
  assert.equal(BASIS_LABEL.QTY, "Quantity");
});
