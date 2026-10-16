import test from "node:test";
import assert from "node:assert/strict";
import { addDays, bucketOf, lotQty, pegFifo, planItem } from "../src/lib/mrp.ts";

const START = "2026-10-16";

test("buckets: late dates fall in the first bucket, dates past the horizon fall out", () => {
  assert.equal(bucketOf("2026-10-10", START, 7, 12), 0);
  assert.equal(bucketOf("2026-10-16", START, 7, 12), 0);
  assert.equal(bucketOf("2026-10-22", START, 7, 12), 0);
  assert.equal(bucketOf("2026-10-23", START, 7, 12), 1);
  assert.equal(bucketOf("2027-01-07", START, 7, 12), 11);
  assert.equal(bucketOf("2027-01-08", START, 7, 12), -1);
  assert.equal(addDays("2026-10-30", -7), "2026-10-23");
});

test("lot for lot orders exactly the shortage, nothing for no shortage", () => {
  assert.deepEqual(lotQty("LOT_FOR_LOT", 37), [37]);
  assert.deepEqual(lotQty("LOT_FOR_LOT", 0), []);
  assert.deepEqual(lotQty("PERIODIC", 12.5), [12.5]);
});

test("fixed lot size rounds the shortage up to whole lots", () => {
  assert.deepEqual(lotQty("FIXED", 120, { lot: 50 }), [150]);
  assert.deepEqual(lotQty("FIXED", 50, { lot: 50 }), [50]);
  assert.deepEqual(lotQty("FIXED", 1, { lot: 25 }), [25]);
});

test("economic order quantity is a floor, not a multiple", () => {
  assert.deepEqual(lotQty("EOQ", 120, { lot: 200 }), [200]);
  assert.deepEqual(lotQty("EOQ", 350, { lot: 200 }), [350]);
});

test("min-max raises small shortages to the minimum and splits big ones at the maximum", () => {
  const p = { min: 50, max: 100 };
  assert.deepEqual(lotQty("MIN_MAX", 20, p), [50]);
  assert.deepEqual(lotQty("MIN_MAX", 100, p), [100]);
  assert.deepEqual(lotQty("MIN_MAX", 200, p), [100, 100]);
  assert.deepEqual(lotQty("MIN_MAX", 210, p), [100, 100, 50]);
  assert.deepEqual(lotQty("MIN_MAX", 250, p), [100, 100, 50]);
  assert.deepEqual(lotQty("MIN_MAX", 10, { min: 30, max: 0 }), [30]);
  assert.deepEqual(lotQty("MIN_MAX", 70, { min: 30, max: 0 }), [70]);
});

test("netting: stock is used first, each shortage is covered when it appears", () => {
  const r = planItem({ onHand: 40, gross: [0, 30, 30, 30], scheduled: [0, 0, 0, 0], leadDays: 7, startDate: START, bucketDays: 7 });
  assert.deepEqual(r.projectedEnd, [40, 10, 0, 0]);
  assert.deepEqual(r.net, [0, 0, 20, 30]);
  assert.deepEqual(r.receipts, [0, 0, 20, 30]);
  assert.deepEqual(r.lots.map((l) => [l.bucket, l.qty, l.receiveOn, l.startOn]), [[2, 20, "2026-10-30", "2026-10-23"], [3, 30, "2026-11-06", "2026-10-30"]]);
});

test("netting: a fixed lot covers later shortages too", () => {
  const r = planItem({ onHand: 40, gross: [0, 30, 30, 30], scheduled: [0, 0, 0, 0], lotRule: "FIXED", lotSize: 50, startDate: START, bucketDays: 7 });
  assert.deepEqual(r.receipts, [0, 0, 50, 0]);
  assert.deepEqual(r.projectedEnd, [40, 10, 30, 0]);
});

test("netting: orders already on the way count, and safety stock raises the bar", () => {
  const a = planItem({ onHand: 10, gross: [0, 30], scheduled: [0, 25], startDate: START, bucketDays: 7 });
  assert.deepEqual(a.lots, []);
  const b = planItem({ onHand: 10, gross: [0, 30], scheduled: [0, 25], safetyStock: 10, startDate: START, bucketDays: 7 });
  assert.deepEqual(b.lots.map((l) => [l.bucket, l.qty]), [[1, 5]]);
  const c = planItem({ onHand: 40, gross: [0, 30, 0, 0], safetyStock: 15, scheduled: [0, 0, 0, 0], startDate: START, bucketDays: 7 });
  assert.deepEqual(c.net, [0, 5, 0, 0]);
  assert.deepEqual(c.projectedEnd, [40, 15, 15, 15]);
});

test("scrap percent grosses the order up so the good quantity still covers the need", () => {
  const r = planItem({ onHand: 0, gross: [100, 0], scheduled: [0, 0], scrapPct: 20, startDate: START, bucketDays: 7 });
  assert.equal(r.lots[0].qty, 125);
  assert.equal(r.lots[0].good, 100);
  assert.deepEqual(r.projectedEnd, [0, 0]);
});

test("a lead time longer than the time left starts today and reports how late it will be", () => {
  const r = planItem({ onHand: 0, gross: [10, 0], scheduled: [0, 0], leadDays: 14, startDate: START, bucketDays: 7 });
  assert.equal(r.lots[0].startOn, START);
  assert.equal(r.lots[0].lateDays, 14);
});

test("periodic lots cover the shortage and the next periods in one order", () => {
  const r = planItem({ onHand: 0, gross: [10, 20, 30, 40, 0], scheduled: [0, 0, 0, 0, 0], lotRule: "PERIODIC", lotSize: 3, startDate: START, bucketDays: 7 });
  assert.deepEqual(r.receipts, [60, 0, 0, 40, 0]);
  assert.deepEqual(r.projectedEnd, [50, 30, 0, 0, 0]);
});

test("min-max inside the plan splits one shortage into several orders in the same bucket", () => {
  const r = planItem({ onHand: 0, gross: [250], scheduled: [0], lotRule: "MIN_MAX", minLot: 50, maxLot: 100, startDate: START, bucketDays: 7 });
  assert.deepEqual(r.lots.map((l) => l.qty), [100, 100, 50]);
  assert.deepEqual(r.projectedEnd, [0]);
});

test("pegging matches requirements to supply first come, first served", () => {
  const pegs = pegFifo(
    [{ ref: "SO-1", qty: 40 }, { ref: "SO-2", qty: 30 }, { ref: "Forecast", qty: 50 }],
    [{ ref: "On hand", qty: 50 }, { ref: "PO-1", qty: 20 }, { ref: "PLN-1", qty: 60 }],
  );
  assert.deepEqual(pegs, [
    { demand: "SO-1", supply: "On hand", qty: 40 },
    { demand: "SO-2", supply: "On hand", qty: 10 },
    { demand: "SO-2", supply: "PO-1", qty: 20 },
    { demand: "Forecast", supply: "PLN-1", qty: 50 },
  ]);
  assert.deepEqual(pegFifo([{ ref: "SO-9", qty: 100 }], [{ ref: "On hand", qty: 30 }]), [{ demand: "SO-9", supply: "On hand", qty: 30 }]);
});
