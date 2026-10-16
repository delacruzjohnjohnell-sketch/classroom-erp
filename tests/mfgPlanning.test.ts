import test from "node:test";
import assert from "node:assert/strict";
import {
  bucketCount, bucketHeading, convertRequisitionsSchema, firstShortage, forecastSchema, monthToDate, plannedOrderSchema, planRunSchema, runSummary, suggestedPrice,
  type GridRow,
} from "../src/lib/mfgPlanning.ts";

const row = (n: number, net: number): GridRow => ({ bucket_no: n, bucket_start: `2026-11-0${n + 1}`, projected_start: 0, gross: 0, scheduled: 0, net, planned_receipt: 0, planned_release: 0, projected_end: 0 });

test("a run needs a sensible horizon and bucket, and at most 60 columns", () => {
  const ok = { start: "2026-11-02", horizon_days: "84", bucket_days: "7", include_forecast: true };
  assert.equal(planRunSchema.safeParse(ok).success, true);
  assert.equal(bucketCount(84, 7), 12);
  assert.equal(bucketCount(85, 7), 13);
  assert.match(String(planRunSchema.safeParse({ ...ok, bucket_days: "5" }).error?.issues[0].message), /daily, weekly/);
  assert.match(String(planRunSchema.safeParse({ ...ok, horizon_days: "3" }).error?.issues[0].message), /at least 7 days/);
  assert.match(String(planRunSchema.safeParse({ ...ok, horizon_days: "365", bucket_days: "1" }).error?.issues[0].message), /365 columns/);
  assert.match(String(planRunSchema.safeParse({ ...ok, start: "" }).error?.issues[0].message), /starts from/);
});

test("a forecast month from the month picker becomes the first of that month", () => {
  assert.equal(monthToDate("2026-12"), "2026-12-01");
  const f = forecastSchema.safeParse({ item_id: "abc", month: "2026-12", qty: "20" });
  assert.equal(f.success && f.data.month, "2026-12-01");
  assert.equal(forecastSchema.safeParse({ item_id: "abc", month: "2026-12", qty: "-1" }).success, false);
  assert.equal(forecastSchema.safeParse({ item_id: "abc", month: "", qty: "5" }).success, false);
  assert.equal(forecastSchema.safeParse({ item_id: "abc", month: "2026-12", qty: "0" }).success, true);
});

test("a planned order needs a quantity and a finish that is not before the start", () => {
  const ok = { item_id: "x", qty: "8", start_date: "2026-12-14", finish_date: "2026-12-21" };
  assert.equal(plannedOrderSchema.safeParse(ok).success, true);
  assert.match(String(plannedOrderSchema.safeParse({ ...ok, finish_date: "2026-12-10" }).error?.issues[0].message), /before the start/);
  assert.match(String(plannedOrderSchema.safeParse({ ...ok, qty: "0" }).error?.issues[0].message), /above zero/);
});

test("converting requisitions needs a vendor, at least one line and a price on each", () => {
  const ok = { vendor_id: "v", lines: [{ req_id: "r1", unit_price: "4.5" }] };
  assert.equal(convertRequisitionsSchema.safeParse(ok).success, true);
  assert.match(String(convertRequisitionsSchema.safeParse({ ...ok, vendor_id: "" }).error?.issues[0].message), /vendor/);
  assert.match(String(convertRequisitionsSchema.safeParse({ ...ok, lines: [] }).error?.issues[0].message), /at least one/);
  assert.match(String(convertRequisitionsSchema.safeParse({ ...ok, lines: [{ req_id: "r1", unit_price: "-1" }] }).error?.issues[0].message), /negative/);
});

test("the first shortage is the earliest column that needed an order", () => {
  assert.equal(firstShortage([row(2, 0), row(1, 0)]), null);
  assert.equal(firstShortage([row(3, 5), row(1, 2), row(2, 0)])?.bucket_no, 1);
});

test("column headings: dates for days and weeks, month names for months", () => {
  assert.equal(bucketHeading("2026-11-02", 7), "Nov 2");
  assert.equal(bucketHeading("2026-12-01", 30), "Dec 2026");
  assert.equal(runSummary({ start_date: "2026-11-02", bucket_count: 12, bucket_days: 7, items_planned: 9 }), "12 weekly columns from Nov 2 · 9 items planned");
  assert.equal(runSummary({ start_date: "2026-11-02", bucket_count: 1, bucket_days: 30, items_planned: 1 }), "1 monthly columns from Nov 2 · 1 item planned");
});

test("the suggested price is the planned price per unit, else the standard cost", () => {
  assert.equal(suggestedPrice({ planned_price: 250, price_unit: 100, standard_cost: 9 }), "2.5");
  assert.equal(suggestedPrice({ planned_price: 0, price_unit: 1, standard_cost: 60 }), "60");
  assert.equal(suggestedPrice(undefined), "0");
});
