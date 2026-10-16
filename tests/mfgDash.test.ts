import test from "node:test";
import assert from "node:assert/strict";
import { firstName, greeting, isoDay, lastDays, outputByDay, pctChange, shareOf, shortDay, stockState, whenLabel } from "../src/lib/mfgDash.ts";

test("the greeting follows the hour and the first name falls back politely", () => {
  assert.equal(greeting(8), "Good morning");
  assert.equal(greeting(12), "Good afternoon");
  assert.equal(greeting(19), "Good evening");
  assert.equal(firstName("John Dela Cruz"), "John");
  assert.equal(firstName("  "), "there");
  assert.equal(firstName(null), "there");
});

test("the last seven days run oldest to newest across a month end", () => {
  assert.deepEqual(lastDays(3, "2026-03-01"), ["2026-02-27", "2026-02-28", "2026-03-01"]);
  assert.equal(lastDays(7, "2026-07-07")[0], "2026-07-01");
  assert.equal(shortDay("2026-07-07"), "Jul 7");
  assert.equal(isoDay(new Date(2026, 0, 5)), "2026-01-05");
});

test("a percent change needs something to compare with", () => {
  assert.equal(pctChange(112, 100), 12);
  assert.equal(pctChange(50, 100), -50);
  assert.equal(pctChange(10, 0), null);
});

test("daily output adds up units made, takes reversals off and never goes below zero", () => {
  const days = ["2026-07-06", "2026-07-07"];
  const rows = [
    { posting_date: "2026-07-06", yield_qty: 100, scrap_qty: 2 },
    { posting_date: "2026-07-06", yield_qty: -30, scrap_qty: 0 },
    { posting_date: "2026-07-07", yield_qty: -5, scrap_qty: 0 },
  ];
  assert.deepEqual(outputByDay(rows, days), [
    { day: "2026-07-06", label: "Jul 6", good: 70, scrap: 2 },
    { day: "2026-07-07", label: "Jul 7", good: 0, scrap: 0 },
  ]);
});

test("product shares keep the biggest few and lump the rest into Others", () => {
  const r = shareOf([{ name: "A", qty: 50 }, { name: "B", qty: 30 }, { name: "C", qty: 10 }, { name: "D", qty: 5 }, { name: "E", qty: 3 }, { name: "F", qty: 2 }, { name: "Z", qty: 0 }], 3);
  assert.deepEqual(r.map((x) => `${x.name}=${x.pct}`), ["A=50", "B=30", "C=10", "Others=10"]);
  assert.deepEqual(shareOf([{ name: "A", qty: 0 }]), []);
});

test("stock status: out, low at or under the reorder level, otherwise healthy", () => {
  assert.equal(stockState(0, 100), "OUT");
  assert.equal(stockState(100, 100), "LOW");
  assert.equal(stockState(101, 100), "OK");
  assert.equal(stockState(5, 0), "OK");   // no reorder level set: never "low"
});

test("activity times read as a clock today, Yesterday, then a date", () => {
  const now = new Date(2026, 6, 7, 10, 24);
  assert.equal(whenLabel(new Date(2026, 6, 7, 9, 5).toISOString(), now), "9:05 AM");
  assert.equal(whenLabel(new Date(2026, 6, 7, 0, 30).toISOString(), now), "12:30 AM");
  assert.equal(whenLabel(new Date(2026, 6, 7, 15, 0).toISOString(), now), "3:00 PM");
  assert.equal(whenLabel(new Date(2026, 6, 6, 20, 0).toISOString(), now), "Yesterday");
  assert.equal(whenLabel(new Date(2026, 5, 20, 8, 0).toISOString(), now), "Jun 20");
  assert.equal(whenLabel("not a date", now), "");
});
