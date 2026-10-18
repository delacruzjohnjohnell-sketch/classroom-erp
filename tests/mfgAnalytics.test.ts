import test from "node:test";
import assert from "node:assert/strict";
import { barShare, curveSaving, monthShort, onTimePct, parseLots, pctText, pivotTrend, rangeOf, rateTone, type TrendRow } from "../src/lib/mfgAnalytics.ts";

test("months read as a short name and year", () => {
  assert.equal(monthShort("2026-09-01"), "Sep 2026");
  assert.equal(monthShort("2027-01-01"), "Jan 2027");
});

test("named ranges are worked out from today", () => {
  assert.deepEqual(rangeOf("this_month", "2026-10-18"), { from: "2026-10-01", to: "2026-10-18" });
  assert.deepEqual(rangeOf("last_month", "2026-10-18"), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(rangeOf("last_month", "2026-01-05"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(rangeOf("year", "2026-10-18"), { from: "2026-01-01", to: "2026-10-18" });
  assert.deepEqual(rangeOf("last_90", "2026-10-18"), { from: "2026-07-21", to: "2026-10-18" });
});

test("lot sizes are read from free text", () => {
  assert.deepEqual(parseLots("1, 10, 100"), [1, 10, 100]);
  assert.deepEqual(parseLots("100 10 1 10"), [1, 10, 100]);
  assert.deepEqual(parseLots("5; abc; -3; 0; 2.5"), [2.5, 5]);
  assert.deepEqual(parseLots(""), []);
  assert.equal(parseLots("1 2 3 4 5 6 7 8 9 10 11 12 13 14").length, 12);
});

test("the variance trend becomes a grid with only the kinds that have figures", () => {
  const rows: TrendRow[] = [
    { month_start: "2026-09-01", bucket: "PPV", amount: 3050 }, { month_start: "2026-09-01", bucket: "MATERIAL", amount: 1650.8 }, { month_start: "2026-09-01", bucket: "SCRAP", amount: 0 },
    { month_start: "2026-10-01", bucket: "PPV", amount: -200 }, { month_start: "2026-10-01", bucket: "MATERIAL", amount: 0 }, { month_start: "2026-10-01", bucket: "SCRAP", amount: 0 },
  ];
  const g = pivotTrend(rows);
  assert.deepEqual(g.months, ["2026-09-01", "2026-10-01"]);
  assert.deepEqual(g.buckets, ["PPV", "MATERIAL"]);          // scrap never had a figure; order follows the usual order
  assert.equal(g.cell("2026-09-01", "PPV"), 3050);
  assert.equal(g.cell("2026-10-01", "MATERIAL"), 0);
  assert.equal(g.cell("2026-08-01", "PPV"), 0);              // a month that is not there reads as zero
  assert.equal(Math.round(g.total("2026-09-01") * 100) / 100, 4700.8);
  assert.equal(Math.round(g.grand * 100) / 100, 4500.8);
});

test("bars are a share of the biggest, and a tiny value still shows", () => {
  assert.equal(barShare(50, 100), 0.5);
  assert.equal(barShare(200, 100), 1);
  assert.equal(barShare(0, 100), 0);
  assert.equal(barShare(-5, 100), 0);
  assert.equal(barShare(5, 0), 0);
  assert.equal(barShare(0.1, 100, 0.02), 0.02);
});

test("rates read as percentages, or a dash", () => {
  assert.equal(pctText(37.456), "37.5 %");
  assert.equal(pctText(0), "0.0 %");
  assert.equal(pctText(null), "—");
  assert.equal(pctText(undefined), "—");
});

test("the saving from a bigger lot and the on-time rate", () => {
  assert.equal(curveSaving([{ lot_size: 1, unit_cost: 850.15 }, { lot_size: 1000, unit_cost: 714.87 }, { lot_size: 10, unit_cost: 728.28 }]), 15.9);
  assert.equal(curveSaving([{ lot_size: 5, unit_cost: 10 }]), null);
  assert.equal(onTimePct(1, 1), 50);
  assert.equal(onTimePct(4, 0), 100);
  assert.equal(onTimePct(0, 0), null);
});

test("traffic lights for a rate where more is better", () => {
  assert.equal(rateTone(95, 90, 70), "good");
  assert.equal(rateTone(75, 90, 70), "warn");
  assert.equal(rateTone(40, 90, 70), "bad");
  assert.equal(rateTone(null, 90, 70), "muted");
});
