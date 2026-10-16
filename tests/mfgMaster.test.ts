import test from "node:test";
import assert from "node:assert/strict";
import {
  bomSchema, conversionSchema, expectedAccountType, firstError, itemSchema, POSTING_LABEL, rateSchema,
  routingSchema, uomSchema, workCenterSchema,
} from "../src/lib/mfgMaster.ts";

const item = {
  sku: "CHAIR", name: "Dining chair", item_type: "FINISHED", make_or_buy: "MAKE", base_uom: "PC",
  procurement_lead_days: "0", production_lead_days: "2", lot_rule: "LOT_FOR_LOT", lot_size: "0", min_lot: "0", max_lot: "0",
  safety_stock: "10", scrap_pct: "0", batch_tracked: false, default_location_id: "", active: true,
};

test("a normal item passes and numbers typed as text are read as numbers", () => {
  const r = itemSchema.safeParse(item);
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal(r.data.production_lead_days, 2);
    assert.equal(r.data.safety_stock, 10);
    assert.equal(r.data.default_location_id, null);
  }
});

test("item rules explain themselves in plain words", () => {
  const msg = (patch: object) => { const r = itemSchema.safeParse({ ...item, ...patch }); return r.success ? "OK" : firstError(r.error); };
  assert.equal(msg({ sku: "  " }), "Give the item a SKU or code.");
  assert.equal(msg({ name: "" }), "Give the item a name.");
  assert.equal(msg({ item_type: "" }), "Choose an item type.");
  assert.equal(msg({ lot_rule: "FIXED", lot_size: "0" }), "A fixed lot size needs a lot size above zero.");
  assert.equal(msg({ lot_rule: "FIXED", lot_size: "50" }), "OK");
  assert.equal(msg({ lot_rule: "MIN_MAX", min_lot: "10", max_lot: "5" }), "The maximum lot can't be below the minimum.");
  assert.equal(msg({ scrap_pct: "100" }), "Scrap % must be below 100.");
  assert.equal(msg({ safety_stock: "-1" }), "Safety stock can't be negative.");
  assert.equal(msg({ production_lead_days: "1.5" }), "Production lead time must be a whole number.");
});

const line = (patch: object = {}) => ({ component_item_id: "leg", qty: "4", uom: "PC", scrap_pct: "5", is_phantom: false, kind: "COMPONENT", cost_share_pct: "0", ...patch });
const bom = (patch: object = {}) => ({ item_id: "chair", alt_no: "1", base_qty: "1", valid_from: "2026-11-01", valid_to: "", description: "", lines: [line()], ...patch });

test("a bill of materials needs lines, a component, sensible dates and no self-reference", () => {
  const msg = (b: object) => { const r = bomSchema.safeParse(b); return r.success ? "OK" : firstError(r.error); };
  assert.equal(msg(bom()), "OK");
  assert.equal(msg(bom({ lines: [] })), "Add at least one line.");
  assert.equal(msg(bom({ lines: [line({ kind: "BYPRODUCT" })] })), "A bill of materials needs at least one component.");
  assert.equal(msg(bom({ lines: [line({ component_item_id: "chair" })] })), "Line 1: an item can't be a component of itself.");
  assert.equal(msg(bom({ valid_to: "2026-10-01" })), "\"Valid to\" can't be before \"valid from\".");
  assert.equal(msg(bom({ base_qty: "0" })), "The base quantity must be above zero.");
  assert.equal(msg(bom({ lines: [line({ qty: "0" })] })), "Every line needs a quantity above zero.");
  assert.equal(msg(bom({ lines: [line(), line({ component_item_id: "x", kind: "COPRODUCT", cost_share_pct: "60" }), line({ component_item_id: "y", kind: "BYPRODUCT", cost_share_pct: "60" })] })),
    "Co-product and by-product cost shares add up to 120%, which is more than 100%.");
});

test("a routing needs operations with unique numbers and a work center on each", () => {
  const op = (patch: object = {}) => ({ op_no: "10", description: "Cut", work_center_id: "wc1", setup_min: "30", run_min_per_unit: "12", teardown_min: "0", queue_min: "0", move_min: "0", control_key: "PP01", component_line_nos: [], ...patch });
  const msg = (r: object) => { const x = routingSchema.safeParse(r); return x.success ? "OK" : firstError(x.error); };
  assert.equal(msg({ item_id: "chair", alt_no: "1", ops: [op()] }), "OK");
  assert.equal(msg({ item_id: "chair", alt_no: "1", ops: [] }), "Add at least one operation.");
  assert.equal(msg({ item_id: "chair", alt_no: "1", ops: [op(), op()] }), "Operation number 10 is used twice.");
  assert.equal(msg({ item_id: "chair", alt_no: "1", ops: [op({ work_center_id: "" })] }), "Choose a work center on every operation.");
  assert.equal(msg({ item_id: "chair", alt_no: "1", ops: [op({ run_min_per_unit: "-2" })] }), "Run time can't be negative.");
});

test("units, conversions, work centers and rates are checked", () => {
  const u = uomSchema.safeParse({ code: " kg ", name: "Kilogram" });
  assert.equal(u.success && u.data.code, "KG");
  assert.equal(conversionSchema.safeParse({ item_id: "", from_uom: "KG", to_uom: "KG", factor: "2" }).success, false);
  assert.equal(conversionSchema.safeParse({ item_id: "", from_uom: "DOZ", to_uom: "PC", factor: "0" }).success, false);
  assert.equal(conversionSchema.safeParse({ item_id: "", from_uom: "DOZ", to_uom: "PC", factor: "12" }).success, true);

  const wc = { code: "", name: "Cutting", cost_center_id: "", shifts: "2", hours_per_shift: "8", utilization_pct: "85", efficiency_pct: "100", working_days: [1, 2, 3, 4, 5], active: true };
  assert.equal(workCenterSchema.safeParse(wc).success, true);
  assert.equal(workCenterSchema.safeParse({ ...wc, shifts: "4" }).success, false);
  assert.equal(workCenterSchema.safeParse({ ...wc, utilization_pct: "101" }).success, false);
  assert.equal(workCenterSchema.safeParse({ ...wc, working_days: [] }).success, false);

  const rate = { work_center_id: "wc1", activity_type_id: "a1", period_start: "2026-11-01", rate: "120" };
  assert.equal(rateSchema.safeParse(rate).success, true);
  const bad = rateSchema.safeParse({ ...rate, period_start: "2026-11-15" });
  assert.equal(bad.success ? "OK" : firstError(bad.error), "A rate period starts on the 1st of a month.");
});

test("each posting key points at the right kind of account, mirroring the database rule", () => {
  assert.equal(expectedAccountType("WIP"), "asset");
  assert.equal(expectedAccountType("RM_INVENTORY"), "asset");
  assert.equal(expectedAccountType("GR_IR"), "liability");
  assert.equal(expectedAccountType("PPV"), "expense");
  assert.equal(expectedAccountType("COGS"), "expense");
  // all 23 keys the company set-up creates have a friendly name
  assert.equal(Object.keys(POSTING_LABEL).length, 23);
});
