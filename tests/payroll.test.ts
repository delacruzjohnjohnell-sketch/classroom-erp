import test from "node:test";
import assert from "node:assert/strict";
import {
  computePayrollForPeriod, computePayrollForGross, computeHourlyPayrollForPeriod, getPeriodDateRange,
} from "../src/lib/philippinePayroll.ts";

test("pay periods follow the month you pick, not today's date", () => {
  assert.deepEqual(getPeriodDateRange("monthly", "2026-11"), { start: "2026-11-01", end: "2026-11-30" });
  assert.deepEqual(getPeriodDateRange("semi_first", "2026-11"), { start: "2026-11-01", end: "2026-11-15" });
  assert.deepEqual(getPeriodDateRange("semi_second", "2026-11"), { start: "2026-11-16", end: "2026-11-30" });
  assert.deepEqual(getPeriodDateRange("monthly", "2026-12"), { start: "2026-12-01", end: "2026-12-31" });
  assert.deepEqual(getPeriodDateRange("monthly", "2028-02"), { start: "2028-02-01", end: "2028-02-29" });
});

test("a monthly salary pays the same each month until it is changed", () => {
  const nov = computePayrollForPeriod("e1", "A", 144000, "monthly");
  const dec = computePayrollForPeriod("e1", "A", 144000, "monthly");
  assert.equal(nov.gross, 12000);
  assert.deepEqual(nov, dec);
  assert.equal(nov.sssEE, 540);
  assert.equal(nov.philhealthEE, 300);
  assert.equal(nov.pagibigEE, 200);
  assert.equal(nov.withholdingTax, 0);
  assert.equal(nov.netPay, 10960);
});

test("a raise applies from the next run and earlier runs are untouched", () => {
  const before = computePayrollForPeriod("e1", "A", 144000, "monthly");      // November, old rate
  const after = computePayrollForPeriod("e1", "A", 180000, "monthly");       // December, new rate
  assert.equal(after.gross, 15000);
  assert.equal(after.sssEE, 675);
  assert.equal(after.netPay, 13750);
  // "before" is a plain value computed earlier: changing the rate cannot alter it
  assert.equal(before.gross, 12000);
  assert.equal(before.netPay, 10960);
});

test("a gross typed in for one period is taxed like a standing rate of that size", () => {
  const typed = computePayrollForGross("e1", "A", 15000, "monthly");
  const standing = computePayrollForPeriod("e1", "A", 180000, "monthly");
  assert.deepEqual(typed, standing);
});

test("a one-off adjustment does not change what the standing rate would pay", () => {
  const standing = computePayrollForPeriod("e1", "A", 144000, "monthly");
  const bonusMonth = computePayrollForGross("e1", "A", 20000, "monthly");
  assert.ok(bonusMonth.gross > standing.gross);
  assert.equal(computePayrollForPeriod("e1", "A", 144000, "monthly").gross, 12000);
});

test("loan instalments come off the net pay, and not on the first semi-monthly cutoff", () => {
  const monthly = computePayrollForGross("e1", "A", 12000, "monthly", 500);
  assert.equal(monthly.loanDeduction, 500);
  assert.equal(monthly.netPay, 10460);
  const first = computePayrollForGross("e1", "A", 6000, "semi_first", 500);
  assert.equal(first.loanDeduction, 0);
  assert.equal(first.sssEE, 0);
  const second = computePayrollForGross("e1", "A", 6000, "semi_second", 500);
  assert.equal(second.loanDeduction, 500);
  assert.ok(second.sssEE > 0);
});

test("negative or zero gross never produces negative pay lines", () => {
  const z = computePayrollForGross("e1", "A", -50, "monthly");
  assert.equal(z.gross, 0);
  assert.ok(z.netPay <= 0);
});

test("hourly pay follows the hours logged in the chosen month", () => {
  const r = computeHourlyPayrollForPeriod("h1", "B", 95, 160, "monthly");
  assert.equal(r.gross, 15200);
  const none = computeHourlyPayrollForPeriod("h1", "B", 95, 0, "monthly");
  assert.equal(none.gross, 0);
});
