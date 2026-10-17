import test from "node:test";
import assert from "node:assert/strict";
import { biggestLoss, oeeOf, oeeTone, pct, totals, weekRange, type OeeTotals } from "../src/lib/mfgOee.ts";

// the saw's week from the database test: 40 h scheduled, 1 h planned stop, 3 h downtime, 1 h set-up, 13 h run, 11 h ideal, 20 good, 2 scrap
const week: OeeTotals = { scheduled: 40, plannedStop: 1, planned: 39, downtime: 3, setup: 1, run: 13, ideal: 11, good: 20, scrap: 2 };

test("OEE is availability × performance × quality", () => {
  const o = oeeOf(week);
  assert.equal(pct(o.availability), "89.7 %");
  assert.equal(pct(o.performance), "84.6 %");
  assert.equal(pct(o.quality), "90.9 %");
  assert.equal(pct(o.oee), "69.0 %");
});

test("a ratio with nothing to divide by is shown as a dash and the OEE with it", () => {
  const idle = oeeOf({ ...week, run: 0, ideal: 0, good: 0, scrap: 0 });
  assert.equal(pct(idle.availability), "89.7 %");
  assert.equal(idle.performance, null);
  assert.equal(idle.quality, null);
  assert.equal(idle.oee, null);
  assert.equal(pct(null), "—");
  assert.equal(oeeOf({ ...week, planned: 0 }).availability, null);
});

test("availability never goes below zero when stoppages exceed the planned time", () => {
  assert.equal(oeeOf({ ...week, planned: 4, downtime: 10 }).availability, 0);
});

test("columns and work centres add up before the ratios are worked out", () => {
  const row = { scheduled_h: 20, planned_stop_h: 0.5, planned_h: 19.5, downtime_h: 1.5, setup_h: 0.5, run_h: 6.5, ideal_h: 5.5, good_qty: 10, scrap_qty: 1 };
  const t = totals([row, row]);
  assert.deepEqual(t, { scheduled: 40, plannedStop: 1, planned: 39, downtime: 3, setup: 1, run: 13, ideal: 11, good: 20, scrap: 2 });
  assert.equal(pct(oeeOf(t).oee), "69.0 %");
});

test("the tone follows the usual benchmarks", () => {
  assert.equal(oeeTone(0.9), "world");
  assert.equal(oeeTone(0.85), "world");
  assert.equal(oeeTone(0.69), "typical");
  assert.equal(oeeTone(0.3), "low");
  assert.equal(oeeTone(null), "none");
});

test("the biggest loss is the one that cost the most hours", () => {
  assert.deepEqual(biggestLoss(week), { kind: "availability", hours: 4 });                       // 4 h stopped or set up, 2 h slow, 1 h scrap
  assert.deepEqual(biggestLoss({ ...week, downtime: 0, setup: 0, run: 20 }), { kind: "performance", hours: 9 });
  assert.deepEqual(biggestLoss({ ...week, downtime: 0, setup: 0, run: 11, ideal: 11, scrap: 11, good: 11 }), { kind: "quality", hours: 5.5 });
  assert.equal(biggestLoss({ ...week, downtime: 0, setup: 0, run: 11, scrap: 0 }), null);
});

test("the last weeks start on a Monday and cover whole weeks", () => {
  assert.deepEqual(weekRange("2026-11-12", 4), { from: "2026-10-19", days: 28 });   // Thursday 12 Nov; its week starts Mon 9 Nov
  assert.deepEqual(weekRange("2026-11-09", 1), { from: "2026-11-09", days: 7 });
  assert.deepEqual(weekRange("2026-11-15", 2), { from: "2026-11-02", days: 14 });   // a Sunday belongs to the week that began on Monday 9th
});
